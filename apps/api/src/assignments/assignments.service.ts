import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, type Session, type SessionAssignment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import type { Role } from '../common/decorators/roles.decorator';
import { buildPageMeta } from '../common/pagination/page-meta';
import { NotificationQueueService } from '../jobs/notification-queue.service';
import { SessionStatus } from '../sessions/dto/session-create.dto';
import { toSessionDto } from '../sessions/session.mapper';
import { AssignRequestDto } from './dto/assign-request.dto';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import {
  AssignmentDto,
  AssignmentListDto,
  AssignmentPageDto,
  AssignmentStatus,
} from './dto/assignment.dto';
import {
  AssignmentPatchStatus,
  AssignmentUpdateRequestDto,
  SkipReason,
} from './dto/assignment-update.dto';

/**
 * Affectations (TLX-051). Autorisation (matrice TX-SPEC-002 §6) :
 *  - `assign` → **coach propriétaire** de la séance, vers des athlètes qui lui sont **liés** ;
 *  - `GET /assignments` / `GET /assignments/{id}` → athlète **titulaire** ou coach **propriétaire**
 *    de la séance affectée.
 * Idempotence (Idempotency-Key) assurée structurellement par l'index unique partiel
 * `ux_assignment_active (session_id, athlete_id) WHERE deleted_at IS NULL` : ré-affecter
 * un athlète déjà affecté renvoie l'affectation existante (aucun doublon).
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly notificationQueue: NotificationQueueService,
  ) {}

  /**
   * Coach affecte une séance (sienne) à des athlètes liés et/ou à des groupes possédés
   * (ADR-30). Les groupes sont résolus vers leurs membres actifs et une affectation est
   * matérialisée par athlète (provenance `groupAssignmentId`). Idempotent par couple
   * (séance, athlète) : un athlète à la fois explicite et membre d'un groupe ciblé n'est
   * affecté qu'une fois (l'affectation explicite, sans provenance, l'emporte).
   */
  async assignSession(
    coachId: string,
    sessionId: string,
    dto: AssignRequestDto,
  ): Promise<AssignmentListDto> {
    await this.ownership.assertSessionOwnedByCoach(coachId, sessionId);
    await this.assertSessionAssignable(sessionId);

    const explicitAthleteIds = [...new Set(dto.athleteIds ?? [])];
    const groupIds = [...new Set(dto.groupIds ?? [])];
    if (explicitAthleteIds.length === 0 && groupIds.length === 0) {
      throw new UnprocessableEntityException({
        error: 'ASSIGN_TARGET_REQUIRED',
        message: 'Préciser au moins un athlète ou un groupe à affecter.',
      });
    }
    // Athlètes explicites : lien requis (les membres de groupe sont liés par construction).
    for (const athleteId of explicitAthleteIds) {
      await this.ownership.assertCoachLinkedToAthlete(coachId, athleteId);
    }
    // Groupes : possession requise.
    for (const groupId of groupIds) {
      await this.ownership.assertGroupOwnedByCoach(coachId, groupId);
    }
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const rows = await this.prisma.$transaction(async (tx) => {
      // Provenance par athlète : explicite → null ; sinon l'affectation de groupe.
      const provenance = new Map<string, string | null>();
      for (const athleteId of explicitAthleteIds) provenance.set(athleteId, null);

      for (const groupId of groupIds) {
        const groupAssignmentId = await upsertActiveGroupAssignment(
          tx,
          sessionId,
          groupId,
          dueDate,
        );
        const members = await tx.groupMember.findMany({
          where: { groupId, leftAt: null },
          select: { athleteId: true },
        });
        for (const { athleteId } of members) {
          if (!provenance.has(athleteId)) provenance.set(athleteId, groupAssignmentId);
        }
      }

      return Promise.all(
        [...provenance].map(([athleteId, groupAssignmentId]) =>
          upsertActiveAssignment(tx, sessionId, athleteId, dueDate, groupAssignmentId),
        ),
      );
    });

    // Notifie chaque athlète nouvellement affecté (ADR-22 : session_assigned) ;
    // une ré-affectation idempotente n'émet rien.
    for (const { assignment, created } of rows) {
      if (created) {
        await this.notificationQueue.enqueue(
          {
            type: 'session_assigned',
            recipientUserId: assignment.athleteId,
            resourceId: assignment.id,
          },
          // « : » est interdit dans un jobId BullMQ (séparateur interne de clés Redis).
          `session_assigned--${assignment.id}`,
        );
      }
    }
    // Endpoint réservé au coach propriétaire → lecteur coach (pas de séance embarquée ici).
    return { data: rows.map((r) => toAssignmentDto(r.assignment, 'coach')) };
  }

  /**
   * Désassigne une séance d'un groupe (ADR-30) : soft-delete l'affectation de groupe
   * active (séance, groupe) **et** les affectations de provenance encore `assigned` et
   * à venir / non datées. Préserve l'historique (completed/in_progress/skipped, passées)
   * et les affectations individuelles. 404 si aucune affectation de groupe active.
   */
  async unassignGroup(coachId: string, sessionId: string, groupId: string): Promise<void> {
    await this.ownership.assertSessionOwnedByCoach(coachId, sessionId);
    await this.ownership.assertGroupOwnedByCoach(coachId, groupId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const groupAssignment = await tx.groupAssignment.findFirst({
        where: { sessionId, groupId, deletedAt: null },
        select: { id: true },
      });
      if (!groupAssignment) {
        throw new NotFoundException('Aucune affectation de groupe active pour cette séance.');
      }
      await tx.groupAssignment.update({
        where: { id: groupAssignment.id },
        data: { deletedAt: now },
      });
      await tx.sessionAssignment.updateMany({
        where: {
          groupAssignmentId: groupAssignment.id,
          status: 'assigned',
          deletedAt: null,
          OR: [{ dueDate: null }, { dueDate: { gte: startOfUtcDay(now) } }],
        },
        data: { deletedAt: now },
      });
    });
  }

  /** Liste paginée, role-aware : athlète → ses affectations ; coach → celles de ses séances. */
  async listAssignments(
    user: AuthenticatedUser,
    q: AssignmentQueryDto,
  ): Promise<AssignmentPageDto> {
    const where = this.scopeForUser(user, q.status);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sessionAssignment.findMany({
        where,
        include: { session: true },
        orderBy: { assignedAt: 'desc' },
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.sessionAssignment.count({ where }),
    ]);
    return {
      data: rows.map((r) => toAssignmentDto(r, user.role, r.session)),
      meta: buildPageMeta(total, q.page, q.limit),
    };
  }

  /** Détail d'une affectation autorisée (titulaire ou coach propriétaire). 404 sinon. */
  async getAssignment(user: AuthenticatedUser, id: string): Promise<AssignmentDto> {
    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { session: true },
    });
    if (!assignment) {
      throw new NotFoundException('Affectation introuvable.');
    }
    this.assertReadable(user, assignment, assignment.session);
    return toAssignmentDto(assignment, user.role, assignment.session);
  }

  /**
   * Met à jour une affectation (ADR-31 — cycle de vie). Replanification (`dueDate`,
   * coach propriétaire), transitions de statut bornées (`in_progress`/`skipped`/
   * `assigned`, jamais `completed`) avec RBAC par transition (cf. §3), motif de skip.
   * Mise à jour partielle : au moins un champ requis (422 `ASSIGNMENT_UPDATE_EMPTY`).
   */
  async patchAssignment(
    user: AuthenticatedUser,
    id: string,
    dto: AssignmentUpdateRequestDto,
  ): Promise<AssignmentDto> {
    const hasStatus = dto.status !== undefined;
    const hasDueDate = dto.dueDate !== undefined; // null = retirer l'échéance (champ fourni)
    if (!hasStatus && !hasDueDate && dto.skipReason === undefined) {
      throw new UnprocessableEntityException({
        error: 'ASSIGNMENT_UPDATE_EMPTY',
        message: 'Aucun champ à mettre à jour.',
      });
    }

    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { session: true },
    });
    if (!assignment) throw new NotFoundException('Affectation introuvable.');

    const isCoachOwner = user.role === 'coach' && assignment.session.coachId === user.id;
    const isAthleteOwner = user.role === 'athlete' && assignment.athleteId === user.id;
    if (!isCoachOwner && !isAthleteOwner) {
      throw new ForbiddenException('Cette affectation ne vous est pas accessible.');
    }

    const data: Prisma.SessionAssignmentUpdateInput = {};

    // Replanification : réservée au coach propriétaire.
    if (hasDueDate) {
      if (!isCoachOwner) {
        throw new ForbiddenException(
          'Seul le coach propriétaire peut replanifier une affectation.',
        );
      }
      // hasDueDate ⇒ champ fourni ; null/'' → retire l'échéance, sinon date ISO.
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }

    // Transition de statut (machine à états ADR-31 + RBAC par transition).
    if (hasStatus) {
      const target = dto.status as AssignmentPatchStatus;
      this.assertTransition(assignment.status, target, { isCoachOwner, isAthleteOwner });
      data.status = target;
      if (target === AssignmentPatchStatus.Skipped) {
        if (!dto.skipReason) {
          throw new UnprocessableEntityException({
            error: 'SKIP_REASON_REQUIRED',
            message: 'Préciser un motif (injury/absence/weather/other) pour signaler une indispo.',
          });
        }
        data.skipReason = dto.skipReason;
      } else {
        // Quitter le statut skipped efface le motif (assigned/in_progress n'en portent pas).
        data.skipReason = null;
      }
    }

    const updated = await this.prisma.sessionAssignment.update({
      where: { id: assignment.id },
      data,
      include: { session: true },
    });
    return toAssignmentDto(updated, user.role, updated.session);
  }

  /**
   * Désassignation soft (ADR-31) : réservée au coach propriétaire. Interdite sur une
   * affectation réalisée (422 `ASSIGNMENT_COMPLETED` — préserve la performance 1:1).
   * Le soft-delete libère l'index unique partiel → réaffectation possible ensuite.
   */
  async removeAssignment(user: AuthenticatedUser, id: string): Promise<void> {
    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { session: { select: { coachId: true } } },
    });
    if (!assignment) throw new NotFoundException('Affectation introuvable.');
    if (!(user.role === 'coach' && assignment.session.coachId === user.id)) {
      throw new ForbiddenException('Seul le coach propriétaire peut désassigner.');
    }
    if (assignment.status === AssignmentStatus.Completed) {
      throw new UnprocessableEntityException({
        error: 'ASSIGNMENT_COMPLETED',
        message: 'Une affectation réalisée ne peut pas être désassignée (performance enregistrée).',
      });
    }
    await this.prisma.sessionAssignment.update({
      where: { id: assignment.id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Valide une transition de statut (ADR-31 §1) et le RBAC associé (§3). `completed`
   * n'est jamais une cible ici (réservé à la soumission de perf). 422 sinon.
   */
  private assertTransition(
    current: string,
    target: AssignmentPatchStatus,
    actor: { isCoachOwner: boolean; isAthleteOwner: boolean },
  ): void {
    if (current === AssignmentStatus.Completed) {
      throw new UnprocessableEntityException({
        error: 'ASSIGNMENT_COMPLETED',
        message: 'Une affectation réalisée ne change plus de statut.',
      });
    }
    // Transitions autorisées (current -> target) ; same-status toléré (no-op).
    const allowed: Record<AssignmentPatchStatus, readonly string[]> = {
      [AssignmentPatchStatus.InProgress]: ['assigned', 'in_progress'],
      [AssignmentPatchStatus.Skipped]: ['assigned', 'in_progress', 'skipped'],
      [AssignmentPatchStatus.Assigned]: ['assigned', 'in_progress', 'skipped'],
    };
    if (!allowed[target].includes(current)) {
      throw new UnprocessableEntityException({
        error: 'ASSIGNMENT_STATUS_TRANSITION',
        message: `Transition de statut invalide : ${current} → ${target}.`,
      });
    }
    // RBAC : démarrer (in_progress) est réservé à l'athlète titulaire ; skip/un-skip
    // sont ouverts à l'athlète titulaire ET au coach propriétaire.
    if (target === AssignmentPatchStatus.InProgress && !actor.isAthleteOwner) {
      throw new ForbiddenException('Seul l’athlète titulaire peut démarrer la séance.');
    }
    if (!actor.isCoachOwner && !actor.isAthleteOwner) {
      throw new ForbiddenException('Cette affectation ne vous est pas accessible.');
    }
  }

  /**
   * Garde-fou ADR-29 : un modèle de séance (statut `template`, bibliothèque C-10) n'est
   * **pas assignable** — il doit d'abord être dupliqué en séance réelle. 422
   * `SESSION_NOT_ASSIGNABLE`. La séance est déjà connue comme appartenant au coach
   * (ownership vérifié en amont) → simple lecture du statut.
   */
  private async assertSessionAssignable(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    if (session?.status === SessionStatus.Template) {
      throw new UnprocessableEntityException({
        error: 'SESSION_NOT_ASSIGNABLE',
        message: 'Un modèle de séance ne peut pas être affecté : dupliquez-le d’abord.',
      });
    }
  }

  private scopeForUser(
    user: AuthenticatedUser,
    status?: AssignmentStatus,
  ): Prisma.SessionAssignmentWhereInput {
    const statusFilter = status ? { status } : {};
    if (user.role === 'coach') {
      return { deletedAt: null, ...statusFilter, session: { coachId: user.id } };
    }
    return { deletedAt: null, ...statusFilter, athleteId: user.id };
  }

  private assertReadable(
    user: AuthenticatedUser,
    assignment: SessionAssignment,
    session: Session,
  ): void {
    const ok =
      user.role === 'coach' ? session.coachId === user.id : assignment.athleteId === user.id;
    if (!ok) {
      throw new ForbiddenException('Cette affectation ne vous est pas accessible.');
    }
  }
}

/** Minuit UTC du jour de `d` — borne « à venir » alignée sur les `dueDate` calendaires. */
function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Crée l'affectation de groupe active (séance, groupe) ou renvoie l'existante
 * (idempotence : index unique partiel `ux_group_assignment_active`). Représente
 * l'intention durable « cette séance est affectée à ce groupe » (ADR-30), base de
 * la réconciliation à l'adhésion. La `dueDate` d'une affectation existante n'est pas
 * réécrite (sémantique idempotente). Retourne l'id du `group_assignment`.
 */
async function upsertActiveGroupAssignment(
  tx: Prisma.TransactionClient,
  sessionId: string,
  groupId: string,
  dueDate: Date | null,
): Promise<string> {
  const existing = await tx.groupAssignment.findFirst({
    where: { sessionId, groupId, deletedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.groupAssignment.create({
    data: { sessionId, groupId, dueDate: dueDate ?? undefined },
    select: { id: true },
  });
  return created.id;
}

/**
 * Crée l'affectation active (séance, athlète) ou renvoie l'existante telle quelle
 * (idempotence : une ré-affectation ne modifie pas une affectation déjà en cours).
 * `created` distingue les deux cas (seules les créations émettent une notification).
 * `groupAssignmentId` trace la provenance (NULL = affectation individuelle).
 */
async function upsertActiveAssignment(
  tx: Prisma.TransactionClient,
  sessionId: string,
  athleteId: string,
  dueDate: Date | null,
  groupAssignmentId: string | null = null,
): Promise<{ assignment: SessionAssignment; created: boolean }> {
  const existing = await tx.sessionAssignment.findFirst({
    where: { sessionId, athleteId, deletedAt: null },
  });
  if (existing) {
    return { assignment: existing, created: false };
  }
  const assignment = await tx.sessionAssignment.create({
    data: { sessionId, athleteId, dueDate: dueDate ?? undefined, groupAssignmentId },
  });
  return { assignment, created: true };
}

function toAssignmentDto(
  assignment: SessionAssignment,
  role: Role,
  session?: Session,
): AssignmentDto {
  return {
    id: assignment.id,
    sessionId: assignment.sessionId,
    athleteId: assignment.athleteId,
    status: assignment.status as AssignmentStatus,
    dueDate: assignment.dueDate ? assignment.dueDate.toISOString().slice(0, 10) : undefined,
    skipReason: (assignment.skipReason as SkipReason | null) ?? undefined,
    // Double lecture (ADR-28) : le brief embarqué est filtré selon le rôle du lecteur.
    session: session ? toSessionDto(session, role) : undefined,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}
