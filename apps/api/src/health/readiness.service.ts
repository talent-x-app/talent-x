import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { redisConnectionFromUrl } from '../jobs/redis-connection';
import type { ReadinessDto } from './dto/readiness.dto';

/**
 * Borne le temps d'établissement de la connexion de sonde. La file hors-ligne
 * fait patienter le `ping()` jusqu'à la connexion (cf. `redis()`) : sans borne
 * explicite, un hôte qui absorbe les paquets sans les refuser ferait traîner la
 * sonde jusqu'au défaut d'ioredis (10 s). Une readiness doit trancher vite.
 */
const REDIS_PROBE_CONNECT_TIMEOUT_MS = 2_000;

/**
 * Évalue la disponibilité des dépendances critiques (§7 TX-OPS-004).
 * Base systématiquement ; Redis (file de jobs BullMQ) dès que `REDIS_URL` est
 * configuré — l'API produit des jobs d'export, sa disponibilité en dépend.
 */
@Injectable()
export class ReadinessService implements OnModuleDestroy {
  private readonly logger = new Logger(ReadinessService.name);
  private redisClient?: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Ferme le client Redis lazy — sans quoi `app.close()` laisse un handle ouvert
   *  (Jest e2e ne se termine jamais quand REDIS_URL est configuré). */
  async onModuleDestroy(): Promise<void> {
    this.disposeRedis();
  }

  async check(): Promise<ReadinessDto> {
    const checks: Record<string, boolean> = {
      database: await this.canReachDatabase(),
    };

    // Redis n'est requis qu'à partir du moment où il est configuré (optionnel en
    // dev/test, requis en staging/prod — cf. validateEnv).
    if (this.config.get<string>('REDIS_URL')) {
      checks.redis = await this.canReachRedis();
    }

    const status = Object.values(checks).every(Boolean) ? 'ready' : 'not_ready';
    return { status, checks };
  }

  private async canReachDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn(`Base injoignable : ${(error as Error).message}`);
      return false;
    }
  }

  private async canReachRedis(): Promise<boolean> {
    try {
      const result = await this.redis().ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.warn(`Redis injoignable : ${(error as Error).message}`);
      // `retryStrategy: () => null` interdit toute reconnexion : un client dont
      // la connexion a échoué est mort pour de bon, et le garder en cache
      // figerait la sonde sur `false` même après le retour de Redis. On le jette
      // pour que le prochain appel reparte d'un client neuf.
      this.disposeRedis();
      return false;
    }
  }

  private redis(): Redis {
    if (!this.redisClient) {
      this.redisClient = new Redis({
        ...redisConnectionFromUrl(this.config.get<string>('REDIS_URL')),
        // Connexion différée au premier `ping()` : la sonde n'ouvre rien tant
        // qu'on ne l'interroge pas.
        lazyConnect: true,
        // La file hors-ligne est REQUISE ici (TLX-232). Sans elle, le `ping()`
        // qui déclenche la connexion est rejeté avant qu'elle ne soit établie
        // (« Stream isn't writeable ») : le premier appel à /ready suivant tout
        // démarrage répondait 503 alors que Redis était sain. Avec elle, la
        // commande patiente jusqu'à la connexion — bornée juste en dessous.
        connectTimeout: REDIS_PROBE_CONNECT_TIMEOUT_MS,
        // Ne pas spammer les reconnexions si Redis est down au moment du check :
        // l'échec est immédiat et définitif (cf. mise au rebut ci-dessus), la
        // sonde répond `false` sans traîner.
        retryStrategy: () => null,
        // Idem pour les commandes : la connexion BullMQ demande `null` (blocage
        // long côté worker), ce qui rejouerait le ping indéfiniment. Une sonde
        // ne réessaie pas — elle constate.
        maxRetriesPerRequest: 1,
      });
    }
    return this.redisClient;
  }

  private disposeRedis(): void {
    if (this.redisClient) {
      this.redisClient.disconnect();
      this.redisClient = undefined;
    }
  }
}
