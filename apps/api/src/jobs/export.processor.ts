import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { ExportArchiveBuilder } from './export-archive-builder';
import type { ExportJobPayload } from './jobs.constants';

/**
 * Traite un job d'export (consommé par le `Worker` dans `worker.ts`) :
 * `processing` → assemble l'archive (`ExportArchiveBuilder`) → dépose sur le
 * stockage objet → passe le job `ready` (`object_key`, `expires_at`). En cas
 * d'échec, le job passe `failed` avec le message d'erreur.
 *
 * L'URL présignée n'est jamais produite ici : elle est générée au GET à partir
 * de `object_key` (ADR-13 §3 — implémenté côté endpoint, TLX-033).
 */
@Injectable()
export class ExportProcessor {
  private readonly logger = new Logger(ExportProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly builder: ExportArchiveBuilder,
    private readonly config: ConfigService,
  ) {}

  async process({ jobId, userId }: ExportJobPayload): Promise<void> {
    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'processing' },
    });

    try {
      const archive = await this.builder.build(userId);
      const objectKey = this.objectKeyFor(userId, jobId, archive.filename);
      await this.storage.putObject(objectKey, archive.body, archive.contentType);

      const ttlHours = this.config.get<number>('EXPORT_ARCHIVE_TTL_HOURS') ?? 24;
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'ready', objectKey, expiresAt },
      });
      // Journal applicatif `data.export` ; l'écriture dans `audit_log` relève de
      // son ticket dédié (pas de service d'audit existant).
      this.logger.log({ event: 'data.export', jobId, userId, status: 'ready', objectKey });
    } catch (error) {
      const message = (error as Error).message;
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: message },
      });
      this.logger.error({ event: 'data.export', jobId, userId, status: 'failed', error: message });
      throw error;
    }
  }

  /** Clé objet déterministe ; l'extension suit le nom de fichier produit. */
  private objectKeyFor(userId: string, jobId: string, filename: string): string {
    const match = /\.([a-z0-9]+)$/i.exec(filename);
    const ext = match ? match[1].toLowerCase() : 'json';
    return `exports/${userId}/${jobId}.${ext}`;
  }
}
