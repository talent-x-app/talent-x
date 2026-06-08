import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { JsonLogger } from './common/logging/json-logger';
import { redisConnectionFromUrl } from './jobs/redis-connection';
import { DATA_EXPORT_QUEUE, type ExportJobPayload } from './jobs/jobs.constants';
import { ExportProcessor } from './jobs/export.processor';
import { WorkerModule } from './worker.module';

/**
 * Entrypoint du worker (process séparé de l'API). Consomme la file `data-export`
 * via BullMQ et délègue chaque job à `ExportProcessor`. Fail-fast si `REDIS_URL`
 * est absent. Arrêt gracieux sur SIGTERM/SIGINT.
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

  const processor = app.get(ExportProcessor);
  const worker = new Worker<ExportJobPayload>(
    DATA_EXPORT_QUEUE,
    async (job) => processor.process(job.data),
    { connection: redisConnectionFromUrl(redisUrl) },
  );

  worker.on('failed', (job, err) => {
    logger.warn(`Job ${job?.id} en échec : ${err.message}`);
  });
  worker.on('ready', () => {
    logger.log(`Worker à l'écoute de la file « ${DATA_EXPORT_QUEUE} ».`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`Signal ${signal} reçu — arrêt du worker.`);
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
