import { Module } from '@nestjs/common';
import { ExportQueueService } from './export-queue.service';
import { NotificationQueueService } from './notification-queue.service';

/**
 * Côté API : expose les producteurs de jobs (export RGPD, notifications). Ne
 * contient PAS les `Worker` (process séparé — cf. `worker.ts` / `worker.module.ts`),
 * conformément à TX-ARCH-001 §4.5.
 */
@Module({
  providers: [ExportQueueService, NotificationQueueService],
  exports: [ExportQueueService, NotificationQueueService],
})
export class JobsModule {}
