import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  NOTIFICATIONS_QUEUE,
  NOTIFICATION_JOB_NAME,
  type NotificationJobPayload,
} from './jobs.constants';
import { redisConnectionFromUrl } from './redis-connection';

/**
 * Producteur de la file `notifications` (côté API — ADR-22). Les services métier
 * émetteurs (affectation, commentaire coach, adhésion groupe) enfilent un signal
 * minimal ; toute la logique d'envoi (garde de préférence, tokens, provider) vit
 * dans le worker. L'enqueue ne doit jamais faire échouer l'opération métier :
 * les erreurs Redis sont loguées, pas propagées.
 */
@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationQueueService.name);
  private queueInstance?: Queue<NotificationJobPayload>;

  constructor(private readonly config: ConfigService) {}

  /**
   * Enfile une notification. `dedupeKey` devient le `jobId` BullMQ : un même
   * événement (ré-affectation idempotente, retry réseau) n'est pas enfilé deux fois
   * tant que le job précédent est encore présent.
   */
  async enqueue(payload: NotificationJobPayload, dedupeKey: string): Promise<void> {
    try {
      await this.queue().add(NOTIFICATION_JOB_NAME, payload, {
        jobId: dedupeKey,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 1_000,
      });
      this.logger.log(
        `Notification enfilée : type=${payload.type} dest=${payload.recipientUserId} job=${dedupeKey}`,
      );
    } catch (error) {
      this.logger.error(
        `Enqueue notification impossible (type=${payload.type} dest=${payload.recipientUserId}) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueInstance?.close();
  }

  private queue(): Queue<NotificationJobPayload> {
    if (!this.queueInstance) {
      this.queueInstance = new Queue<NotificationJobPayload>(NOTIFICATIONS_QUEUE, {
        connection: redisConnectionFromUrl(this.config.get<string>('REDIS_URL')),
      });
    }
    return this.queueInstance;
  }
}
