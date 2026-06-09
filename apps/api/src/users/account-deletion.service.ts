import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { type JobDto } from './dto/export.dto';

/**
 * Droit à l'effacement (TLX-034 / ADR-15) — phase immédiate.
 *
 * `DELETE /users/me` : soft-delete (`deleted_at`), révocation des refresh & device
 * tokens, journal `account.deletion`. La purge/anonymisation définitive est différée
 * (worker `AccountPurgeService`, après la fenêtre de rétention). Réponse 202 avec un
 * `jobId` **synthétique non persisté** (accusé ; pas de table de jobs — ADR-13 §2).
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async requestDeletion(userId: string): Promise<JobDto> {
    const now = new Date();
    await this.prisma.$transaction([
      // Idempotent : ne (re)pose `deleted_at` que s'il est nul.
      this.prisma.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.deviceToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.auditLog.create({
        data: { actorId: userId, action: 'account.deletion', entityType: 'user', entityId: userId },
      }),
    ]);

    this.logger.log(`Suppression de compte demandée : user=${userId}`);
    return { jobId: randomUUID(), status: 'pending' };
  }
}
