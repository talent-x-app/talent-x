import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Session, type SessionAssignment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPageMeta } from '../common/pagination/page-meta';
import { toSessionDto } from '../sessions/session.mapper';
import { AssignRequestDto } from './dto/assign-request.dto';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import {
  AssignmentDto,
  AssignmentListDto,
  AssignmentPageDto,
  AssignmentStatus,
} from './dto/assignment.dto';

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
  ) {}

  /** Coach affecte une séance (sienne) à des athlètes liés. Idempotent par couple (séance, athlète). */
  async assignSession(
    coachId: string,
    sessionId: string,
    dto: AssignRequestDto,
  ): Promise<AssignmentListDto> {
    await this.ownership.assertSessionOwnedByCoach(coachId, sessionId);
    const athleteIds = [...new Set(dto.athleteIds)];
    for (const athleteId of athleteIds) {
      await this.ownership.assertCoachLinkedToAthlete(coachId, athleteId);
    }
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    const rows = await this.prisma.$transaction((tx) =>
      Promise.all(
        athleteIds.map((athleteId) => upsertActiveAssignment(tx, sessionId, athleteId, dueDate)),
      ),
    );
    return { data: rows.map((r) => toAssignmentDto(r)) };
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
      data: rows.map((r) => toAssignmentDto(r, r.session)),
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
    return toAssignmentDto(assignment, assignment.session);
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

/**
 * Crée l'affectation active (séance, athlète) ou renvoie l'existante (idempotence).
 * Met à jour `dueDate` si fournie et l'affectation existait déjà sans échéance fixée.
 */
async function upsertActiveAssignment(
  tx: Prisma.TransactionClient,
  sessionId: string,
  athleteId: string,
  dueDate: Date | null,
): Promise<SessionAssignment> {
  const existing = await tx.sessionAssignment.findFirst({
    where: { sessionId, athleteId, deletedAt: null },
  });
  if (existing) {
    return existing;
  }
  return tx.sessionAssignment.create({
    data: { sessionId, athleteId, dueDate: dueDate ?? undefined },
  });
}

function toAssignmentDto(assignment: SessionAssignment, session?: Session): AssignmentDto {
  return {
    id: assignment.id,
    sessionId: assignment.sessionId,
    athleteId: assignment.athleteId,
    status: assignment.status as AssignmentStatus,
    dueDate: assignment.dueDate ? assignment.dueDate.toISOString().slice(0, 10) : undefined,
    session: session ? toSessionDto(session) : undefined,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
  };
}
