import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { DATA_EXPORT_QUEUE, EXPORT_JOB_NAME, type ExportJobPayload } from './jobs.constants';
import { redisConnectionFromUrl } from './redis-connection';

/**
 * Producteur de la file `data-export` (côté API). Réutilisable par l'endpoint
 * d'export (TLX-033) : à la réception d'un `POST /users/me/export`, il crée la
 * ligne `export_jobs` puis appelle `enqueueExport(jobId, userId)`.
 */
@Injectable()
export class ExportQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ExportQueueService.name);
  private queueInstance?: Queue<ExportJobPayload>;

  constructor(private readonly config: ConfigService) {}

  async enqueueExport(jobId: string, userId: string): Promise<void> {
    await this.queue().add(
      EXPORT_JOB_NAME,
      { jobId, userId },
      // `jobId` rend l'enqueue idempotent : un même export n'est pas mis deux fois.
      { jobId, removeOnComplete: true, removeOnFail: 1000 },
    );
    this.logger.log(`Export enfilé : job=${jobId} user=${userId}`);
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
