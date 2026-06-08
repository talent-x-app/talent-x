import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExportQueueService } from '../jobs/export-queue.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { type ExportJobDto, type JobDto, type JobStatus } from './dto/export.dto';

const ACTIVE_STATUSES = ['pending', 'processing'];

/**
 * Endpoints d'export RGPD (TLX-033). Côté API : crée le job + l'enfile (worker),
 * lit son statut et génère l'URL présignée au GET (ADR-13/ADR-14).
 *
 * Le **contenu** de l'archive est produit par le worker (`DataExportArchiveBuilder`).
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ExportQueueService,
    private readonly storage: ObjectStorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Demande un export (202). Idempotent : si un export est déjà actif
   * (`pending`/`processing`), on le renvoie sans en recréer (un seul export actif —
   * ADR-13, garanti aussi en base par l'index unique partiel).
   */
  async requestExport(userId: string): Promise<JobDto> {
    const active = await this.findActive(userId);
    if (active) {
      return { jobId: active.id, status: active.status as JobStatus };
    }

    try {
      const job = await this.prisma.exportJob.create({ data: { userId, status: 'pending' } });
      await this.queue.enqueueExport(job.id, userId);
      await this.prisma.auditLog.create({
        data: {
          actorId: userId,
          action: 'data.export',
          entityType: 'export_job',
          entityId: job.id,
        },
      });
      this.logger.log(`Export demandé : job=${job.id} user=${userId}`);
      return { jobId: job.id, status: 'pending' };
    } catch (error) {
      // Course « deux demandes simultanées » : l'index unique partiel rejette la
      // seconde insertion → on renvoie l'export actif déjà créé.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.findActive(userId);
        if (existing) {
          return { jobId: existing.id, status: existing.status as JobStatus };
        }
      }
      throw error;
    }
  }

  /**
   * Statut d'un export du demandeur (404 si le job n'est pas le sien). Si `ready` et
   * non expiré, génère une URL présignée (TTL borné par l'expiration de l'archive).
   */
  async getExport(userId: string, jobId: string): Promise<ExportJobDto> {
    const job = await this.prisma.exportJob.findFirst({ where: { id: jobId, userId } });
    if (!job) {
      throw new NotFoundException('Export introuvable');
    }

    const now = new Date();
    const expired = job.status === 'expired' || (job.expiresAt != null && job.expiresAt <= now);

    if (job.status === 'ready' && !expired && job.objectKey && job.expiresAt) {
      const configuredTtl = this.config.get<number>('EXPORT_URL_TTL_SECONDS') ?? 86400;
      const secondsUntilExpiry = Math.floor((job.expiresAt.getTime() - now.getTime()) / 1000);
      const ttl = Math.max(1, Math.min(configuredTtl, secondsUntilExpiry));
      const downloadUrl = await this.storage.getPresignedDownloadUrl(job.objectKey, ttl);
      return {
        jobId: job.id,
        status: 'ready',
        downloadUrl,
        expiresAt: job.expiresAt.toISOString(),
      };
    }

    // `expired` n'existe pas au contrat (Job.status) : une archive expirée n'est plus
    // téléchargeable → présentée comme `failed`.
    const status: JobStatus = expired ? 'failed' : (job.status as JobStatus);
    return { jobId: job.id, status };
  }

  private findActive(userId: string) {
    return this.prisma.exportJob.findFirst({
      where: { userId, status: { in: ACTIVE_STATUSES } },
    });
  }
}
