import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { redisConnectionFromUrl } from '../jobs/redis-connection';
import type { ReadinessDto } from './dto/readiness.dto';

/**
 * Évalue la disponibilité des dépendances critiques (§7 TX-OPS-004).
 * Base systématiquement ; Redis (file de jobs BullMQ) dès que `REDIS_URL` est
 * configuré — l'API produit des jobs d'export, sa disponibilité en dépend.
 */
@Injectable()
export class ReadinessService {
  private readonly logger = new Logger(ReadinessService.name);
  private redisClient?: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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
      return false;
    }
  }

  private redis(): Redis {
    if (!this.redisClient) {
      this.redisClient = new Redis({
        ...redisConnectionFromUrl(this.config.get<string>('REDIS_URL')),
        // Ne pas spammer les reconnexions si Redis est down au moment du check.
        lazyConnect: true,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
    }
    return this.redisClient;
  }
}
