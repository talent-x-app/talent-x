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
import { storedExercisesSchemaVersion } from '../sessions/exercises-schema';
import { toSessionDto } from '../sessions/session.mapper';
import { AssignRequestDto } from './dto/assign-request.dto';
import { occurrenceDates, RECURRENCE_MAX_OCCURRENCES } from './recurrence';
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
import { AttendanceRequestDto, AttendanceStatus, AttendanceSummaryDto } from './dto/attendance.dto';

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
    // Récurrence (ADR-35) : suite de dates d'occurrence (≥ 1). Sans `recurrence`,
    // une seule occurrence à `dueDate` (ou non datée) → comportement actuel.
    const occurrences = this.resolveOccurrenceDates(dto);

    const rows = await this.prisma.$transaction(async (tx) => {
      // Occurrences 2..N = duplications serveur de la séance d'origine (contenu identique,
      // ADR-35 §2). Source chargée une fois ; aucune lecture si pas de récurrence.
      const source =
        occurrences.length > 1
          ? await tx.session.findUniqueOrThrow({ where: { id: sessionId } })
          : null;

      const all: Array<{ assignment: SessionAssignment; created: boolean; occurrence: number }> =
        [];
      for (let i = 0; i < occurrences.length; i++) {
        const occSessionId =
          i === 0 ? sessionId : await duplicateSessionForOccurrence(tx, source!, coachId);
        const dueDate = occurrences[i] ? new Date(occurrences[i] as string) : null;
        const fan = await fanOutAssignments(
          tx,
          occSessionId,
          dueDate,
          explicitAthleteIds,
          groupIds,
        );
        for (const r of fan) all.push({ ...r, occurrence: i });
      }
      return all;
    });

    // Notifie chaque athlète nouvellement affecté (ADR-22 : session_assigned) ;
    // une ré-affectation idempotente n'émet rien. Pour une série (ADR-35 §4), une
    // **seule** notification par athlète, portée par l'occurrence 1 (les occurrences
    // 2..N sont des séances dupliquées, toujours « créées » mais déjà couvertes).
    for (const { assignment, created, occurrence } of rows) {
      if (created && occurrence === 0) {
        await this.notificationQueue.enqueue(
          {
            type: 'session_assigned',
            recipientUserId: assignment.athleteId,
            resourceId: assignment.id,
            // Acteur (ADR-55) = le coach qui affecte ; résolu en prénom au read côté athlète.
            actorId: coachId,
          },
          // « : » est interdit dans un jobId BullMQ (séparateur interne de clés Redis).
          `session_assigned--${assignment.id}`,
        );
      }
    }
    // Endpoint réservé au coach propriétaire → lecteur coach (pas de séance embarquée ici).
    // La réponse liste les affectations de **toutes** les occurrences (ADR-35).
    return { data: rows.map((r) => toAssignmentDto(r.assignment, 'coach')) };
  }

  /**
   * Dates des occurrences à matérialiser (ADR-35). Sans `recurrence` : une seule
   * occurrence (`dueDate` ou non datée). Avec : exige `dueDate` (422
   * `RECURRENCE_REQUIRES_DUE_DATE`), `until ≥ dueDate` (422 `INVALID_RECURRENCE`),
   * borne à 52 occurrences (422 `RECURRENCE_TOO_LONG`).
   */
  private resolveOccurrenceDates(dto: AssignRequestDto): Array<string | null> {
    if (!dto.recurrence) return [dto.dueDate ?? null];

    if (!dto.dueDate) {
      throw new UnprocessableEntityException({
        error: 'RECURRENCE_REQUIRES_DUE_DATE',
        message: 'Une échéance (dueDate) est requise pour répéter une affectation.',
      });
    }
    const { until } = dto.recurrence;
    if (until.slice(0, 10) < dto.dueDate.slice(0, 10)) {
      throw new UnprocessableEntityException({
        error: 'INVALID_RECURRENCE',
        message: "La date de fin doit être postérieure ou égale à l'échéance.",
      });
    }
    const dates = occurrenceDates(dto.dueDate, until, RECURRENCE_MAX_OCCURRENCES);
    if (dates.length > RECURRENCE_MAX_OCCURRENCES) {
      throw new UnprocessableEntityException({
        error: 'RECURRENCE_TOO_LONG',
        message: `Une récurrence ne peut dépasser ${RECURRENCE_MAX_OCCURRENCES} occurrences.`,
      });
    }
    return dates;
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
    const where = this.scopeForUser(user, q.status, q.sessionId);
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
   * Déclare la **présence** (RSVP) d'un athlète à sa séance (ADR-43 §1) — axe **orthogonal** au
   * cycle d'exécution `status` (ADR-31) : on écrit `attendance` (+ `attendanceReason`) sans jamais
   * toucher `status` ni l'assiduité. RBAC : **athlète titulaire** de l'affectation. Invariant :
   * `reason` requis ssi `attendance='not_going'` (422 `ATTENDANCE_REASON_REQUIRED`) ; ignoré sinon.
   */
  async setAttendance(
    user: AuthenticatedUser,
    id: string,
    dto: AttendanceRequestDto,
  ): Promise<AssignmentDto> {
    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { session: true },
    });
    if (!assignment) throw new NotFoundException('Affectation introuvable.');

    // Présence déclarée par l'athlète titulaire (intention de présence à *sa* séance).
    if (!(user.role === 'athlete' && assignment.athleteId === user.id)) {
      throw new ForbiddenException('Seul l’athlète titulaire peut déclarer sa présence.');
    }

    const notGoing = dto.attendance === AttendanceStatus.NotGoing;
    if (notGoing && !dto.reason) {
      throw new UnprocessableEntityException({
        error: 'ATTENDANCE_REASON_REQUIRED',
        message: 'Préciser un motif (injury/absence/weather/other) pour signaler une absence.',
      });
    }

    const updated = await this.prisma.sessionAssignment.update({
      where: { id: assignment.id },
      data: {
        attendance: dto.attendance,
        // Motif conservé seulement pour `not_going` (ignoré/effacé pour going/maybe).
        attendanceReason: notGoing ? (dto.reason as SkipReason) : null,
      },
      include: { session: true },
    });
    return toAssignmentDto(updated, user.role, updated.session);
  }

  /**
   * Agrégat de présence de la séance (ADR-45) — compteurs **sans identités** (RGPD, ADR-43 §5).
   * On résout la séance depuis l'affectation du demandeur (RBAC = titulaire ou coach propriétaire,
   * même garde que `getAssignment`) puis on compte `attendance` sur **toutes** les affectations
   * actives partageant le `sessionId` (fan-out ADR-30). Aucune provenance de groupe requise.
   */
  async getAttendanceSummary(user: AuthenticatedUser, id: string): Promise<AttendanceSummaryDto> {
    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: { id, deletedAt: null },
      include: { session: true },
    });
    if (!assignment) throw new NotFoundException('Affectation introuvable.');
    this.assertReadable(user, assignment, assignment.session);

    const grouped = await this.prisma.sessionAssignment.groupBy({
      by: ['attendance'],
      where: { sessionId: assignment.sessionId, deletedAt: null },
      _count: { id: true },
    });

    const summary: AttendanceSummaryDto = {
      going: 0,
      notGoing: 0,
      maybe: 0,
      noResponse: 0,
      total: 0,
    };
    for (const row of grouped) {
      const n = row._count.id;
      if (row.attendance === AttendanceStatus.Going) summary.going = n;
      else if (row.attendance === AttendanceStatus.NotGoing) summary.notGoing = n;
      else if (row.attendance === AttendanceStatus.Maybe) summary.maybe = n;
      else summary.noResponse += n; // attendance NULL (sans réponse)
    }
    summary.total = summary.going + summary.notGoing + summary.maybe + summary.noResponse;
    return summary;
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
   * Garde-fou d'assignabilité — **les quatre statuts, une bonne fois** (TLX-256).
   *
   * Il ne traitait que `template` (ADR-29 : un modèle se duplique avant de s'affecter), et ne
   * disait rien des deux autres états non diffusables. Les compléter séparément aurait produit
   * la même dérive que les quatre opérations sans appelant : un cas à la fois, trouvé par hasard.
   *
   * - `template` : bibliothèque C-10, à dupliquer d'abord (ADR-29, inchangé).
   * - `archived` : la séance a été **rangée** (TLX-256). L'affecter la ferait ressortir chez
   *   l'athlète alors que le coach vient de la retirer de ses listes.
   * - `draft` : un brouillon ne se diffuse pas — arbitrage rendu sur TLX-258, appliqué ici.
   * - `published` : seul statut diffusable.
   *
   * Les affectations **existantes** d'une séance qu'on archive sont conservées : archiver range
   * le plan du coach, ça ne retire pas du travail déjà donné à l'athlète. Ce garde ne porte que
   * sur les **nouvelles** affectations.
   */
  private async assertSessionAssignable(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    const refusals: Partial<Record<SessionStatus, string>> = {
      [SessionStatus.Template]:
        'Un modèle de séance ne peut pas être affecté : dupliquez-le d’abord.',
      [SessionStatus.Archived]:
        'Une séance archivée ne peut pas être affectée : désarchivez-la d’abord.',
      [SessionStatus.Draft]: 'Un brouillon ne peut pas être affecté : publiez la séance d’abord.',
    };
    const message = session ? refusals[session.status as SessionStatus] : undefined;
    if (message) {
      throw new UnprocessableEntityException({ error: 'SESSION_NOT_ASSIGNABLE', message });
    }
  }

  private scopeForUser(
    user: AuthenticatedUser,
    status?: AssignmentStatus,
    sessionId?: string,
  ): Prisma.SessionAssignmentWhereInput {
    const statusFilter = status ? { status } : {};
    // `sessionId` (TLX-193) restreint **dans** le scope d'autorisation — il ne l'élargit jamais :
    // côté coach il s'ajoute au filtre `session.coachId` (il ne voit que ses propres séances).
    if (user.role === 'coach') {
      return {
        deletedAt: null,
        ...statusFilter,
        session: { coachId: user.id, ...(sessionId ? { id: sessionId } : {}) },
      };
    }
    return {
      deletedAt: null,
      ...statusFilter,
      athleteId: user.id,
      ...(sessionId ? { sessionId } : {}),
    };
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
 * Fan-out ADR-30 pour **une** occurrence (séance, date) : résout les groupes vers leurs
 * membres actifs (provenance `groupAssignmentId`), dédup par athlète (l'affectation
 * explicite, sans provenance, l'emporte), et matérialise une `SessionAssignment` par
 * athlète. Réutilisé tel quel pour chaque occurrence d'une récurrence (ADR-35 §2).
 */
async function fanOutAssignments(
  tx: Prisma.TransactionClient,
  sessionId: string,
  dueDate: Date | null,
  explicitAthleteIds: string[],
  groupIds: string[],
): Promise<Array<{ assignment: SessionAssignment; created: boolean }>> {
  // Provenance par athlète : explicite → null ; sinon l'affectation de groupe.
  const provenance = new Map<string, string | null>();
  for (const athleteId of explicitAthleteIds) provenance.set(athleteId, null);

  for (const groupId of groupIds) {
    const groupAssignmentId = await upsertActiveGroupAssignment(tx, sessionId, groupId, dueDate);
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
}

/**
 * Duplique une séance pour une occurrence de récurrence (ADR-35 §2) : copie serveur au
 * **contenu identique** (titre, description, statut, exercises, brief) — pas de suffixe ni
 * de remise à zéro (contrairement à `duplicateSession` côté bibliothèque). La date de
 * l'occurrence porte sur l'affectation, pas sur la séance. Retourne l'id de la copie.
 */
async function duplicateSessionForOccurrence(
  tx: Prisma.TransactionClient,
  source: Session,
  coachId: string,
): Promise<string> {
  const copy = await tx.session.create({
    data: {
      coachId,
      title: source.title,
      description: source.description,
      status: source.status,
      exercises: source.exercises as Prisma.InputJsonValue,
      // Colonne alignée sur le tag du JSONB copié (TLX-144).
      exercisesSchemaVersion: storedExercisesSchemaVersion(source),
      ...(source.brief != null ? { brief: source.brief as Prisma.InputJsonValue } : {}),
    },
    select: { id: true },
  });
  return copy.id;
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
    // Présence déclarée (ADR-43 §1) — orthogonale au statut, exposée à tous les lecteurs autorisés.
    attendance: (assignment.attendance as AttendanceStatus | null) ?? undefined,
    attendanceReason: (assignment.attendanceReason as SkipReason | null) ?? undefined,
    // Double lecture (ADR-28) : le brief embarqué est filtré selon le rôle du lecteur.
    session: session ? toSessionDto(session, role) : undefined,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}
