import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DATA_EXPORT_QUEUE, type ExportJobPayload } from '../jobs/jobs.constants';
import { redisConnectionFromUrl } from '../jobs/redis-connection';

/** Profondeur de la file par état BullMQ (TX-OPS-004 §7). */
export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface QueueMetricsSnapshot {
  /** `REDIS_URL` configuré — sinon les métriques de file sont indisponibles (dev/test). */
  enabled: boolean;
  /** Les compteurs ont pu être lus (Redis joignable). */
  up: boolean;
  /** Présent uniquement quand `up` est vrai. */
  counts?: QueueCounts;
}

/** États remontés à `getJobCounts` (ordre stable pour l'exposition). */
const COUNT_TYPES = ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'] as const;

/**
 * Lit la profondeur de la file `data-export` (BullMQ) pour la supervision
 * opérationnelle — reliquat observabilité de TLX-035 (TLX-83 / TX-OPS-004 §7).
 *
 * Connexion Redis en lecture seule, ouverte paresseusement et partagée. Ne lève
 * jamais : Redis injoignable → snapshot dégradé (`up:false`), pour que `/metrics`
 * réponde toujours (le scrapeur en déduit la panne via `talentx_export_queue_up`).
 */
@Injectable()
export class QueueMetricsService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsService.name);
  private queueInstance?: Queue<ExportJobPayload>;

  constructor(private readonly config: ConfigService) {}

  async snapshot(): Promise<QueueMetricsSnapshot> {
    if (!this.config.get<string>('REDIS_URL')) {
      return { enabled: false, up: false };
    }
    try {
      const raw = await this.queue().getJobCounts(...COUNT_TYPES);
      const counts: QueueCounts = {
        waiting: raw.waiting ?? 0,
        active: raw.active ?? 0,
        completed: raw.completed ?? 0,
        failed: raw.failed ?? 0,
        delayed: raw.delayed ?? 0,
        paused: raw.paused ?? 0,
      };
      return { enabled: true, up: true, counts };
    } catch (error) {
      this.logger.warn(`Métriques de file indisponibles : ${(error as Error).message}`);
      return { enabled: true, up: false };
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueInstance?.close();
  }

  private queue(): Queue<ExportJobPayload> {
    if (!this.queueInstance) {
      this.queueInstance = new Queue<ExportJobPayload>(DATA_EXPORT_QUEUE, {
        connection: redisConnectionFromUrl(this.config.get<string>('REDIS_URL')),
      });
    }
    return this.queueInstance;
  }
}
