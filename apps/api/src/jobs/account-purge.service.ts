import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Suffixe d'e-mail des comptes anonymisés — sert aussi de marqueur « déjà purgé » (ADR-15 §3). */
const ANONYMIZED_EMAIL_SUFFIX = '@anonymized.invalid';

/**
 * Purge / anonymisation différée des comptes supprimés (TLX-034 / ADR-15 §2).
 *
 * Après la fenêtre de rétention (`ACCOUNT_PURGE_RETENTION_DAYS`), efface les données
 * personnelles et anonymise la ligne `users` (la FK `Restrict` coach→groupes/séances
 * interdit la suppression). Tâche planifiée — enregistrée UNIQUEMENT dans le worker.
 */
@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger(AccountPurgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<void> {
    const retentionDays = this.config.get<number>('ACCOUNT_PURGE_RETENTION_DAYS') ?? 30;
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.user.findMany({
      where: {
        deletedAt: { lte: cutoff },
        NOT: { email: { endsWith: ANONYMIZED_EMAIL_SUFFIX } },
      },
      select: { id: true },
    });
    if (candidates.length === 0) {
      return;
    }

    let purged = 0;
    for (const { id } of candidates) {
      try {
        await this.purgeUser(id);
        purged += 1;
      } catch (error) {
        // On ne casse pas le lot : le compte sera retenté au prochain passage
        // (toujours candidat tant que l'e-mail n'est pas anonymisé).
        this.logger.warn(`Purge échouée pour le compte ${id} : ${(error as Error).message}`);
      }
    }
    this.logger.log(`Comptes purgés/anonymisés : ${purged}/${candidates.length}`);
  }

  /** Applique le manifeste d'effacement (ADR-15 §2) à un compte, en transaction. */
  private purgeUser(userId: string): Promise<unknown> {
    return this.prisma.$transaction([
      // Suppression des données personnelles propres.
      this.prisma.performance.deleteMany({ where: { athleteId: userId } }),
      // Records personnels (ADR-20) — manifeste d'effacement (ADR-15).
      this.prisma.personalRecord.deleteMany({ where: { athleteId: userId } }),
      this.prisma.groupMember.deleteMany({ where: { athleteId: userId } }),
      this.prisma.coachAthleteLink.deleteMany({
        where: { OR: [{ coachId: userId }, { athleteId: userId }] },
      }),
      this.prisma.deviceToken.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.exportJob.deleteMany({ where: { userId } }),
      // Scrub du contenu rédigé (intégrité des fils conservée).
      this.prisma.comment.updateMany({
        where: { authorId: userId },
        data: { body: '[contenu supprimé]' },
      }),
      // Traces de correction de perf (ADR-33) : le squelette d'audit reste, mais le
      // `metadata` (marques avant/après) est une donnée personnelle → neutralisé (ADR-15).
      this.prisma.auditLog.updateMany({
        where: { actorId: userId, action: 'performance.correction' },
        data: { metadata: Prisma.DbNull },
      }),
      // Anonymisation de la ligne user (FK Restrict → on garde la ligne).
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}${ANONYMIZED_EMAIL_SUFFIX}`,
          firstName: 'Utilisateur',
          lastName: 'supprimé',
          sport: null,
          bio: null,
          photoUrl: null,
          birthDate: null,
          passwordHash: '',
          twoFactorSecret: null,
          twoFactorEnabled: false,
        },
      }),
      this.prisma.auditLog.create({
        data: { actorId: userId, action: 'account.purge', entityType: 'user', entityId: userId },
      }),
    ]);
  }
}
