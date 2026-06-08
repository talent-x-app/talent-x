import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';

/**
 * Nettoyage planifié des archives d'export expirées (ADR-13 §1) : supprime
 * l'objet du stockage puis passe le job `ready` → `expired`. Enregistré
 * UNIQUEMENT dans le contexte worker (`worker.module.ts`) pour éviter une double
 * exécution si l'API était répliquée.
 */
@Injectable()
export class ExportCleanupService {
  private readonly logger = new Logger(ExportCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.exportJob.findMany({
      where: { status: 'ready', expiresAt: { lt: now } },
      select: { id: true, objectKey: true },
    });
    if (expired.length === 0) {
      return;
    }

    let purged = 0;
    for (const job of expired) {
      try {
        if (job.objectKey) {
          await this.storage.deleteObject(job.objectKey);
        }
        await this.prisma.exportJob.update({
          where: { id: job.id },
          data: { status: 'expired' },
        });
        purged += 1;
      } catch (error) {
        // On n'interrompt pas le lot : un objet récalcitrant sera retenté au
        // prochain passage (le job reste `ready` tant que la purge échoue).
        this.logger.warn(`Purge échouée pour le job ${job.id} : ${(error as Error).message}`);
      }
    }
    this.logger.log(`Archives expirées purgées : ${purged}/${expired.length}`);
  }
}
