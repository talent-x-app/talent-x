import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { buildPageMeta, parseSort } from '../common/pagination/page-meta';
import { CompetitionCreateDto, CompetitionStatus } from './dto/competition-create.dto';
import { CompetitionUpdateDto } from './dto/competition-update.dto';
import { CompetitionQueryDto } from './dto/competition-query.dto';
import { CompetitionDto, CompetitionPageDto } from './dto/competition.dto';
import { summarizeEntryStatus, toCompetitionDto } from './competition.mapper';

const COMPETITION_SORTABLE = ['createdAt', 'updatedAt', 'startDate', 'name'] as const;

/**
 * Compétitions (TLX-101, ADR-24). Miroir de `SessionsService` :
 *  - écriture (create/update/delete) → **coach propriétaire** ;
 *  - lecture (`GET /competitions`, `GET /competitions/{id}`) → coach propriétaire **ou**
 *    athlète **engagé** (lien via `competition_entries`).
 * RBAC (rôle) posé par le `RolesGuard` global ; ownership par `OwnershipService`.
 * RGPD : données de planification, PAS de santé → aucune porte de consentement (ADR-24 §4).
 */
@Injectable()
export class CompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async createCompetition(coachId: string, dto: CompetitionCreateDto): Promise<CompetitionDto> {
    assertDateOrder(dto.startDate, dto.endDate);
    const competition = await this.prisma.competition.create({
      data: {
        coachId,
        name: dto.name,
        discipline: dto.discipline,
        location: dto.location,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        description: dto.description,
        status: dto.status ?? CompetitionStatus.Draft,
      },
    });
    return toCompetitionDto(competition);
  }

  /** Liste paginée, role-aware : coach → les siennes ; athlète → celles où il est engagé. */
  async listCompetitions(
    user: AuthenticatedUser,
    q: CompetitionQueryDto,
  ): Promise<CompetitionPageDto> {
    const where = this.scopeForUser(user, q.status);
    // Athlète : embarque ses propres engagements actifs pour exposer son statut d'engagement
    // (TLX-92) ; coach : aucun (le badge reste le statut de la compétition).
    const include =
      user.role === 'athlete'
        ? { entries: { where: { athleteId: user.id, deletedAt: null }, select: { status: true } } }
        : undefined;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.competition.findMany({
        where,
        include,
        orderBy: parseSort(q.sort, COMPETITION_SORTABLE, { startDate: 'desc' }),
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.competition.count({ where }),
    ]);
    return {
      data: rows.map((row) => {
        const entries = (row as { entries?: { status: string }[] }).entries;
        return toCompetitionDto(
          row,
          entries ? summarizeEntryStatus(entries.map((e) => e.status)) : undefined,
        );
      }),
      meta: buildPageMeta(total, q.page, q.limit),
    };
  }

  /** Lecture d'une compétition autorisée (propriétaire ou athlète engagé). 404 si inexistante. */
  async getCompetition(user: AuthenticatedUser, id: string): Promise<CompetitionDto> {
    const competition = await this.prisma.competition.findFirst({ where: { id, deletedAt: null } });
    if (!competition) {
      throw new NotFoundException('Compétition introuvable.');
    }
    if (user.role === 'coach') {
      if (competition.coachId !== user.id) {
        throw new ForbiddenException('Cette compétition ne vous appartient pas.');
      }
      return toCompetitionDto(competition);
    }
    // Athlète : la lecture exige un engagement actif ; on en dérive son statut (TLX-92).
    const entries = await this.prisma.competitionEntry.findMany({
      where: { competitionId: competition.id, athleteId: user.id, deletedAt: null },
      select: { status: true },
    });
    if (entries.length === 0) {
      throw new ForbiddenException("Vous n'êtes pas engagé à cette compétition.");
    }
    return toCompetitionDto(competition, summarizeEntryStatus(entries.map((e) => e.status)));
  }

  async updateCompetition(
    coachId: string,
    id: string,
    dto: CompetitionUpdateDto,
  ): Promise<CompetitionDto> {
    await this.ownership.assertCompetitionOwnedByCoach(coachId, id);
    // Valide l'ordre sur les valeurs *effectives* (DTO fusionné aux valeurs existantes) pour
    // renvoyer un 400 propre plutôt que de laisser la contrainte CHECK lever un 500.
    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const current = await this.prisma.competition.findUniqueOrThrow({
        where: { id },
        select: { startDate: true, endDate: true },
      });
      const start = dto.startDate ?? current.startDate.toISOString().slice(0, 10);
      const end =
        dto.endDate !== undefined
          ? dto.endDate
          : (current.endDate?.toISOString().slice(0, 10) ?? undefined);
      assertDateOrder(start, end || undefined);
    }
    const competition = await this.prisma.competition.update({
      where: { id },
      data: {
        ...definedScalars(dto),
        ...(dto.startDate !== undefined ? { startDate: new Date(dto.startDate) } : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
      },
    });
    return toCompetitionDto(competition);
  }

  /** Suppression logique (soft-delete). Owner uniquement. */
  async deleteCompetition(coachId: string, id: string): Promise<void> {
    await this.ownership.assertCompetitionOwnedByCoach(coachId, id);
    await this.prisma.competition.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Construit le `where` Prisma selon le rôle (coach = siennes / athlète = engagé). */
  private scopeForUser(
    user: AuthenticatedUser,
    status?: CompetitionStatus,
  ): Prisma.CompetitionWhereInput {
    const statusFilter = status ? { status } : {};
    if (user.role === 'coach') {
      return { coachId: user.id, deletedAt: null, ...statusFilter };
    }
    return {
      deletedAt: null,
      ...statusFilter,
      entries: { some: { athleteId: user.id, deletedAt: null } },
    };
  }
}

/**
 * Garde-fou applicatif de l'ordre des dates (miroir de la contrainte CHECK `ck_competition_dates`) :
 * renvoie un 400 explicite au lieu de laisser la base lever une erreur générique (500).
 * Comparaison lexicographique valide car les dates sont calendaires `YYYY-MM-DD`.
 */
function assertDateOrder(startDate: string, endDate?: string): void {
  if (endDate && endDate < startDate) {
    throw new BadRequestException(
      'La date de fin doit être postérieure ou égale à la date de début.',
    );
  }
}

/** Champs scalaires explicitement fournis (hors dates traitées à part). */
function definedScalars(dto: CompetitionUpdateDto): Prisma.CompetitionUpdateInput {
  const out: Prisma.CompetitionUpdateInput = {};
  if (dto.name !== undefined) out.name = dto.name;
  if (dto.discipline !== undefined) out.discipline = dto.discipline;
  if (dto.location !== undefined) out.location = dto.location;
  if (dto.description !== undefined) out.description = dto.description;
  if (dto.status !== undefined) out.status = dto.status;
  return out;
}
