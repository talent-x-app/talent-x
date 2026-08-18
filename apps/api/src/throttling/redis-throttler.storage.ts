import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { redisConnectionFromUrl } from '../jobs/redis-connection';

/** Forme de retour attendue par ThrottlerGuard (temps en SECONDES, ttl reçus en ms). */
interface StorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Compteur + fenêtre + blocage en un aller-retour atomique. Deux clés par
 * (route, IP, throttler) : le compteur (expire avec la fenêtre) et le marqueur
 * de blocage (expire avec blockDuration). Sans script, INCR et PEXPIRE
 * laisseraient une course où un compteur survit sans TTL.
 */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('EXISTS', KEYS[2]) == 1
local blockTtl = 0
if blocked then
  blockTtl = redis.call('PTTL', KEYS[2])
elseif hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = true
  blockTtl = tonumber(ARGV[3])
end
if blocked then
  return { hits, ttl, 1, blockTtl }
end
return { hits, ttl, 0, blockTtl }
`;

/**
 * Stockage Redis du rate limiting (TLX-233). Contrairement au stockage mémoire
 * par défaut, les compteurs sont partagés entre instances d'API — indispensable
 * dès qu'il y en a plus d'une, et déjà correct avec une seule.
 *
 * Fail-open assumé : si Redis est injoignable, la requête passe (avec un warn)
 * plutôt que de transformer une panne Redis en indisponibilité totale de l'API.
 * Redis en panne est déjà signalé par /ready (ReadinessService).
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private client?: Redis;

  constructor(private readonly config: ConfigService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<StorageRecord> {
    try {
      const [totalHits, ttlMs, blocked, blockTtlMs] = (await this.redis().eval(
        INCREMENT_SCRIPT,
        2,
        `throttle:${key}`,
        `throttle:${key}:blocked`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
      return {
        totalHits,
        timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
        isBlocked: blocked === 1,
        timeToBlockExpire: Math.max(0, Math.ceil(blockTtlMs / 1000)),
      };
    } catch (error) {
      this.logger.warn(`Rate limiting indisponible (Redis) : ${(error as Error).message}`);
      return { totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }

  /** Ferme la connexion — sans quoi app.close() laisse un handle ouvert (Jest). */
  onModuleDestroy(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = undefined;
    }
  }

  private redis(): Redis {
    if (!this.client) {
      this.client = new Redis({
        ...redisConnectionFromUrl(this.config.get<string>('REDIS_URL')),
        // Connexion à la première commande seulement : le provider est construit
        // dans tous les contextes (worker compris) mais ne doit se connecter que
        // si une requête HTTP est effectivement throttlée.
        lazyConnect: true,
        // Échec rapide si Redis est down (fail-open ci-dessus) — le défaut
        // maxRetriesPerRequest: null de la config BullMQ ferait attendre la
        // requête HTTP indéfiniment.
        maxRetriesPerRequest: 2,
      });
    }
    return this.client;
  }
}
