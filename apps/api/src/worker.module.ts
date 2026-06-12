import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { ExportProcessor } from './jobs/export.processor';
import { ExportCleanupService } from './jobs/export-cleanup.service';
import { ExportArchiveBuilder } from './jobs/export-archive-builder';
import { DataExportArchiveBuilder } from './jobs/data-export-archive-builder';
import { AccountPurgeService } from './jobs/account-purge.service';
import { NotificationProcessor } from './jobs/notification.processor';
import { LoggingPushProvider, PushProvider } from './jobs/push-provider';
import { EmailProcessor } from './jobs/email.processor';
import { LoggingEmailProvider, EmailProvider } from './jobs/email-provider';

/**
 * Contexte d'exécution du worker (process séparé de l'API — TX-ARCH-001 §4.5).
 * Fournit le processor d'export, la tâche de nettoyage planifiée et le binding
 * du point d'extension `ExportArchiveBuilder` (placeholder tant que TLX-033
 * n'a pas livré le contenu réel de l'export).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '.env'),
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
  ],
  providers: [
    ExportProcessor,
    ExportCleanupService,
    AccountPurgeService,
    { provide: ExportArchiveBuilder, useClass: DataExportArchiveBuilder },
    NotificationProcessor,
    // Provider logging tant que les credentials APNs/FCM n'existent pas (ADR-22 §4).
    { provide: PushProvider, useClass: LoggingPushProvider },
    EmailProcessor,
    // Provider logging tant que le fournisseur SMTP/email n'est pas branché (TLX-104).
    { provide: EmailProvider, useClass: LoggingEmailProvider },
  ],
})
export class WorkerModule {}
