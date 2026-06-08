import { Module } from '@nestjs/common';
import { ExportQueueService } from './export-queue.service';

/**
 * Côté API : expose le producteur de jobs d'export. Ne contient PAS le `Worker`
 * (process séparé — cf. `worker.ts` / `worker.module.ts`), conformément à
 * TX-ARCH-001 §4.5. Importé par `UsersModule` quand l'endpoint d'export arrive
 * (TLX-033).
 */
@Module({
  providers: [ExportQueueService],
  exports: [ExportQueueService],
})
export class JobsModule {}
