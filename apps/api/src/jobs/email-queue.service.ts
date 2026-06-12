import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { EMAIL_JOB_NAME, TRANSACTIONAL_EMAIL_QUEUE, type EmailJobPayload } from './jobs.constants';
import { redisConnectionFromUrl } from './redis-connection';

/**
 * Producteur de la file `transactional-email` (côté API — TLX-104). Les services
 * métier enfilent un email à envoyer ; toute la composition (sujet, corps, lien)
 * et l'envoi vivent dans le worker. Comme la file notifications, l'enqueue ne doit
 * jamais faire échouer l'opération métier : les erreurs Redis sont loguées, pas
 * propagées — `forgot-password` répond toujours 202 (réponse neutre).
 */
@Injectable()
export class EmailQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private queueInstance?: Queue<EmailJobPayload>;

  constructor(private readonly config: ConfigService) {}

  /** Enfile l'email de réinitialisation de mot de passe (jeton en clair côté file). */
  enqueuePasswordReset(to: string, token: string): Promise<void> {
    return this.enqueue({ kind: 'password_reset', to, params: { token } });
  }

  private async enqueue(payload: EmailJobPayload): Promise<void> {
    try {
      await this.queue().add(EMAIL_JOB_NAME, payload, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 1_000,
      });
      this.logger.log(`Email enfilé : kind=${payload.kind} to=${payload.to}`);
    } catch (error) {
      this.logger.error(
        `Enqueue email impossible (kind=${payload.kind}) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queueInstance?.close();
  }

  private queue(): Queue<EmailJobPayload> {
    if (!this.queueInstance) {
      this.queueInstance = new Queue<EmailJobPayload>(TRANSACTIONAL_EMAIL_QUEUE, {
        connection: redisConnectionFromUrl(this.config.get<string>('REDIS_URL')),
      });
    }
    return this.queueInstance;
  }
}
