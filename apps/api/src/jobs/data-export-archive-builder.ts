import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { type ExportArchive, ExportArchiveBuilder } from './export-archive-builder';

/**
 * Construit l'archive d'export RGPD réelle d'un utilisateur (ADR-14).
 *
 * Tourne dans le **worker** (appelé par `ExportProcessor`). Respecte strictement le
 * manifeste et la frontière des données de tiers d'ADR-14 :
 * - aucun secret (`passwordHash`, `twoFactorSecret`) ni artefact d'auth (refresh tokens,
 *   valeur des device tokens) ;
 * - côté athlète : commentaires **rédigés par lui** seulement (pas les feedbacks reçus) ;
 * - côté coach : objets créés par lui, **sans aucune identité d'athlète**.
 */
@Injectable()
export class DataExportArchiveBuilder extends ExportArchiveBuilder {
  /** Version du format d'enveloppe (cf. ADR-14 §1). */
  private static readonly SCHEMA_VERSION = 1;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async build(userId: string): Promise<ExportArchive> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const role = user.role;

    const data: Record<string, unknown> = {
      ...(await this.commonSections(userId, user)),
      ...(role === 'coach' ? await this.coachSections(userId) : await this.athleteSections(userId)),
    };

    const envelope = {
      schemaVersion: DataExportArchiveBuilder.SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      subject: { userId, role },
      scope:
        "Données personnelles de l'utilisateur uniquement. Secrets et données de tiers " +
        'exclus (ADR-14).',
      data,
    };

    return {
      body: JSON.stringify(envelope, null, 2),
      contentType: 'application/json',
      filename: `export-${userId}.json`,
    };
  }

  /** Sections communes aux deux rôles. */
  private async commonSections(
    userId: string,
    user: Awaited<ReturnType<PrismaService['user']['findUniqueOrThrow']>>,
  ): Promise<Record<string, unknown>> {
    const [consents, deviceTokens, exportRequests, auditTrail, commentsAuthored] =
      await Promise.all([
        this.prisma.consent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.deviceToken.findMany({ where: { userId } }),
        this.prisma.exportJob.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
        this.prisma.auditLog.findMany({
          where: { actorId: userId },
          // Pas la PK BigInt (non sérialisable JSON, sans valeur pour la personne).
          select: { action: true, entityType: true, entityId: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.comment.findMany({ where: { authorId: userId } }),
      ]);

    return {
      // Profil sans secrets (ADR-14 §2).
      profile: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        sport: user.sport,
        bio: user.bio,
        photoUrl: user.photoUrl,
        birthDate: user.birthDate,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      consents: consents.map((c) => ({
        type: c.type,
        granted: c.granted,
        textVersion: c.textVersion,
        grantedAt: c.grantedAt,
        revokedAt: c.revokedAt,
        createdAt: c.createdAt,
      })),
      // Pas la valeur du token (ADR-14 §2).
      deviceTokens: deviceTokens.map((d) => ({
        platform: d.platform,
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt,
        revokedAt: d.revokedAt,
      })),
      exportRequests: exportRequests.map((j) => ({
        id: j.id,
        status: j.status,
        createdAt: j.createdAt,
        expiresAt: j.expiresAt,
      })),
      auditTrail,
      // Commentaires rédigés PAR l'utilisateur (pas les feedbacks reçus — ADR-14 §5).
      commentsAuthored: commentsAuthored.map((c) => ({
        body: c.body,
        sessionId: c.sessionId,
        performanceId: c.performanceId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  /** Sections spécifiques athlète. */
  private async athleteSections(userId: string): Promise<Record<string, unknown>> {
    const [memberships, coachLinks, assignments, performances] = await Promise.all([
      this.prisma.groupMember.findMany({
        where: { athleteId: userId },
        include: { group: { select: { name: true } } },
      }),
      this.prisma.coachAthleteLink.findMany({
        where: { athleteId: userId },
        include: { coach: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.sessionAssignment.findMany({
        where: { athleteId: userId },
        include: {
          session: {
            select: {
              title: true,
              description: true,
              scheduledDate: true,
              exercises: true,
              exercisesSchemaVersion: true,
            },
          },
        },
      }),
      this.prisma.performance.findMany({ where: { athleteId: userId } }),
    ]);

    return {
      groupMemberships: memberships.map((m) => ({
        group: m.group.name,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
      })),
      // Nom du coach inclus (counterparty direct), sans e-mail (ADR-14 §5).
      coachLinks: coachLinks.map((l) => ({
        source: l.source,
        coach: `${l.coach.firstName} ${l.coach.lastName}`,
        createdAt: l.createdAt,
        endedAt: l.endedAt,
      })),
      assignments: assignments.map((a) => ({
        status: a.status,
        assignedAt: a.assignedAt,
        dueDate: a.dueDate,
        session: a.session,
      })),
      performances: performances.map((p) => ({
        results: p.results,
        resultsSchemaVersion: p.resultsSchemaVersion,
        rpe: p.rpe,
        notes: p.notes,
        submittedAt: p.submittedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    };
  }

  /** Sections spécifiques coach — AUCUNE identité d'athlète (ADR-14 §5). */
  private async coachSections(userId: string): Promise<Record<string, unknown>> {
    const [groups, sessions, links] = await Promise.all([
      this.prisma.group.findMany({
        where: { coachId: userId },
        include: { _count: { select: { members: true } } },
      }),
      this.prisma.session.findMany({ where: { coachId: userId } }),
      this.prisma.coachAthleteLink.findMany({ where: { coachId: userId } }),
    ]);

    return {
      coachedGroups: groups.map((g) => ({
        name: g.name,
        description: g.description,
        inviteCode: g.inviteCode,
        memberCount: g._count.members,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        deletedAt: g.deletedAt,
      })),
      coachedSessions: sessions.map((s) => ({
        title: s.title,
        description: s.description,
        scheduledDate: s.scheduledDate,
        status: s.status,
        exercises: s.exercises,
        exercisesSchemaVersion: s.exercisesSchemaVersion,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        deletedAt: s.deletedAt,
      })),
      // source/dates/groupId seulement — pas d'athleteId (ADR-14 §5).
      coachAthleteLinks: links.map((l) => ({
        source: l.source,
        groupId: l.groupId,
        createdAt: l.createdAt,
        endedAt: l.endedAt,
      })),
    };
  }
}
