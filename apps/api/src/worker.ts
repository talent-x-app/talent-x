import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { JsonLogger } from './common/logging/json-logger';
import { redisConnectionFromUrl } from './jobs/redis-connection';
import {
  DATA_EXPORT_QUEUE,
  NOTIFICATIONS_QUEUE,
  type ExportJobPayload,
  type NotificationJobPayload,
} from './jobs/jobs.constants';
import { ExportProcessor } from './jobs/export.processor';
import { NotificationProcessor } from './jobs/notification.processor';
import { WorkerModule } from './worker.module';

/**
 * Entrypoint du worker (process séparé de l'API). Consomme les files `data-export`
 * et `notifications` via BullMQ et délègue chaque job à son processor. Fail-fast si
 * `REDIS_URL` est absent. Arrêt gracieux sur SIGTERM/SIGINT.
 *
 * Dev :  pnpm --filter @talent-x/api worker:dev
 * Prod : node dist/worker.js
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(new JsonLogger());

  const config = app.get(ConfigService);
  const redisUrl = config.get<string>('REDIS_URL');
  if (!redisUrl) {
    logger.error('REDIS_URL est requis pour démarrer le worker (file de jobs BullMQ).');
    await app.close();
    process.exit(1);
  }

  const exportProcessor = app.get(ExportProcessor);
  const notificationProcessor = app.get(NotificationProcessor);
  const workers = [
    new Worker<ExportJobPayload>(
      DATA_EXPORT_QUEUE,
      async (job) => exportProcessor.process(job.data),
      { connection: redisConnectionFromUrl(redisUrl) },
    ),
    new Worker<NotificationJobPayload>(
      NOTIFICATIONS_QUEUE,
      async (job) => notificationProcessor.process(job.data),
      { connection: redisConnectionFromUrl(redisUrl) },
    ),
  ];

  for (const worker of workers) {
    worker.on('failed', (job, err) => {
      logger.warn(`Job ${job?.id} (${worker.name}) en échec : ${err.message}`);
    });
    worker.on('ready', () => {
      logger.log(`Worker à l'écoute de la file « ${worker.name} ».`);
    });
  }

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Signal ${signal} reçu — arrêt du worker.`);
    await Promise.all(workers.map((worker) => worker.close()));
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
