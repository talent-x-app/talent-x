import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Session } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPageMeta, parseSort } from '../common/pagination/page-meta';
import { SessionCreateDto, SessionStatus } from './dto/session-create.dto';
import { SessionUpdateDto } from './dto/session-update.dto';
import { SessionQueryDto } from './dto/session-query.dto';
import { SessionDto, SessionPageDto } from './dto/session.dto';
import type { ExercisesDocDto } from './dto/exercises.dto';
import type { SessionBriefDto } from './dto/session-brief.dto';
import { toSessionDto } from './session.mapper';

const SESSION_SORTABLE = ['createdAt', 'updatedAt', 'scheduledDate', 'title'] as const;

/**
 * Séances (TLX-050). Source d'autorisation (matrice TX-SPEC-002 §6) :
 *  - écriture (create/update/delete/duplicate/archive) → **coach propriétaire** de la séance ;
 *  - lecture (`GET /sessions`, `GET /sessions/{id}`) → coach propriétaire **ou** athlète
 *    à qui la séance est **affectée** (lien via `session_assignments`).
 * Le RBAC (rôle) est posé par le `RolesGuard` global ; l'ownership par `OwnershipService`.
 * Les blocs typés sont stockés en JSONB (`exercises`, schéma `ExercisesDoc`, TX-DATA-006).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async createSession(coachId: string, dto: SessionCreateDto): Promise<SessionDto> {
    const session = await this.prisma.session.create({
      data: {
        coachId,
        title: dto.title,
        description: dto.description,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : undefined,
        status: dto.status ?? SessionStatus.Draft,
        exercises: toExercisesJson(dto.exercises),
        ...(dto.brief !== undefined ? { brief: toBriefJson(dto.brief) } : {}),
      },
    });
    // Lecteur = le coach créateur → brief complet (intent + coachNotes).
    return toSessionDto(session, 'coach');
  }

  /** Liste paginée, role-aware : coach → ses séances ; athlète → celles affectées. */
  async listSessions(user: AuthenticatedUser, q: SessionQueryDto): Promise<SessionPageDto> {
    const where = this.scopeForUser(user, q.status);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        orderBy: parseSort(q.sort, SESSION_SORTABLE, { createdAt: 'desc' }),
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.session.count({ where }),
    ]);
    return {
      data: rows.map((row) => toSessionDto(row, user.role)),
      meta: buildPageMeta(total, q.page, q.limit),
    };
  }

  /** Lecture d'une séance autorisée (propriétaire ou affecté). 404 si inexistante. */
  async getSession(user: AuthenticatedUser, id: string): Promise<SessionDto> {
    const session = await this.prisma.session.findFirst({ where: { id, deletedAt: null } });
    if (!session) {
      throw new NotFoundException('Séance introuvable.');
    }
    await this.assertReadable(user, session);
    return toSessionDto(session, user.role);
  }

  async updateSession(coachId: string, id: string, dto: SessionUpdateDto): Promise<SessionDto> {
    await this.ownership.assertSessionOwnedByCoach(coachId, id);
    const session = await this.prisma.session.update({
      where: { id },
      data: {
        ...definedScalars(dto),
        ...(dto.scheduledDate !== undefined
          ? { scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null }
          : {}),
        ...(dto.exercises !== undefined ? { exercises: toExercisesJson(dto.exercises) } : {}),
        ...(dto.brief !== undefined ? { brief: toBriefJson(dto.brief) } : {}),
      },
    });
    // Écriture réservée au coach propriétaire → lecteur coach.
    return toSessionDto(session, 'coach');
  }

  /** Suppression logique (soft-delete). Owner uniquement. */
  async deleteSession(coachId: string, id: string): Promise<void> {
    await this.ownership.assertSessionOwnedByCoach(coachId, id);
    await this.prisma.session.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Duplique une séance en nouveau brouillon (titre suffixé, date remise à zéro). */
  async duplicateSession(coachId: string, id: string): Promise<SessionDto> {
    await this.ownership.assertSessionOwnedByCoach(coachId, id);
    const source = await this.prisma.session.findUniqueOrThrow({ where: { id } });
    const copy = await this.prisma.session.create({
      data: {
        coachId,
        title: `${source.title} (copie)`,
        description: source.description,
        status: SessionStatus.Draft,
        exercises: source.exercises as Prisma.InputJsonValue,
        exercisesSchemaVersion: source.exercisesSchemaVersion,
        // Le brief fait partie du modèle dupliqué (ADR-28, impacts modèles C-10).
        ...(source.brief != null ? { brief: source.brief as Prisma.InputJsonValue } : {}),
      },
    });
    return toSessionDto(copy, 'coach');
  }

  /** Archive une séance (status → archived). Owner uniquement. */
  async archiveSession(coachId: string, id: string): Promise<SessionDto> {
    await this.ownership.assertSessionOwnedByCoach(coachId, id);
    const session = await this.prisma.session.update({
      where: { id },
      data: { status: SessionStatus.Archived },
    });
    return toSessionDto(session, 'coach');
  }

  /** Construit le `where` Prisma selon le rôle (coach = siennes / athlète = affectées). */
  private scopeForUser(user: AuthenticatedUser, status?: SessionStatus): Prisma.SessionWhereInput {
    const statusFilter = status ? { status } : {};
    if (user.role === 'coach') {
      return { coachId: user.id, deletedAt: null, ...statusFilter };
    }
    return {
      deletedAt: null,
      ...statusFilter,
      assignments: { some: { athleteId: user.id, deletedAt: null } },
    };
  }

  /** 403 si l'utilisateur n'est ni propriétaire ni athlète affecté à la séance. */
  private async assertReadable(user: AuthenticatedUser, session: Session): Promise<void> {
    if (user.role === 'coach') {
      if (session.coachId !== user.id) {
        throw new ForbiddenException('Cette séance ne vous appartient pas.');
      }
      return;
    }
    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: { sessionId: session.id, athleteId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Cette séance ne vous est pas affectée.');
    }
  }
}

/** Version courante du contrat JSONB des séances (cf. TX-DATA-006 §9.1, ADR-18). */
const EXERCISES_SCHEMA_VERSION = 2;

/** Sérialise un `ExercisesDoc` en JSON Prisma (schemaVersion v2 par défaut, cf. ADR-18). */
function toExercisesJson(doc: ExercisesDocDto): Prisma.InputJsonValue {
  return {
    schemaVersion: doc.schemaVersion ?? EXERCISES_SCHEMA_VERSION,
    items: doc.items as unknown as Prisma.InputJsonValue[],
  };
}

/** Version courante du contrat JSONB du brief de séance (ADR-28). */
const BRIEF_SCHEMA_VERSION = 1;

/**
 * Sérialise un `SessionBrief` en JSON Prisma (schemaVersion v1 par défaut, cf. ADR-28).
 * Le document est stocké tel quel (tous champs optionnels) ; le filtrage par rôle est
 * fait à la **lecture** (mapper), jamais au stockage.
 */
function toBriefJson(brief: SessionBriefDto): Prisma.InputJsonValue {
  return {
    ...brief,
    schemaVersion: brief.schemaVersion ?? BRIEF_SCHEMA_VERSION,
  } as unknown as Prisma.InputJsonValue;
}

/** Champs scalaires explicitement fournis (hors scheduledDate/exercises traités à part). */
function definedScalars(dto: SessionUpdateDto): Prisma.SessionUpdateInput {
  const out: Prisma.SessionUpdateInput = {};
  if (dto.title !== undefined) out.title = dto.title;
  if (dto.description !== undefined) out.description = dto.description;
  if (dto.status !== undefined) out.status = dto.status;
  return out;
}
