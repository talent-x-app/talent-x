import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Competition, type CompetitionEntry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { EngageRequestDto } from './dto/engage-request.dto';
import { CompetitionEntryListDto } from './dto/competition-entry.dto';
import { toCompetitionEntryDto } from './competition.mapper';

/**
 * Engagements d'athlètes (TLX-101, ADR-24). Miroir de `AssignmentsService` :
 *  - `engage` → **coach propriétaire** de la compétition, vers des athlètes qui lui sont **liés** ;
 *  - `GET /competitions/{id}/entries` → coach propriétaire **ou** athlète engagé ;
 *  - `unengage` (désengagement) → coach propriétaire (soft-delete).
 * Idempotence (Idempotency-Key) assurée structurellement par l'index unique partiel
 * `ux_entry_active (competition_id, athlete_id) WHERE deleted_at IS NULL` : ré-engager
 * un athlète déjà engagé renvoie l'engagement existant (aucun doublon).
 */
@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  /** Coach engage des athlètes liés à sa compétition. Idempotent par couple (compétition, athlète). */
  async engageAthletes(
    coachId: string,
    competitionId: string,
    dto: EngageRequestDto,
  ): Promise<CompetitionEntryListDto> {
    await this.ownership.assertCompetitionOwnedByCoach(coachId, competitionId);
    const athleteIds = [...new Set(dto.athleteIds)];
    for (const athleteId of athleteIds) {
      await this.ownership.assertCoachLinkedToAthlete(coachId, athleteId);
    }

    const rows = await this.prisma.$transaction((tx) =>
      Promise.all(
        athleteIds.map((athleteId) =>
          upsertActiveEntry(tx, competitionId, athleteId, dto.eventLabel ?? null),
        ),
      ),
    );
    return { data: rows.map((r) => toCompetitionEntryDto(r)) };
  }

  /** Liste des engagements d'une compétition autorisée (propriétaire ou athlète engagé). */
  async listEntries(
    user: AuthenticatedUser,
    competitionId: string,
  ): Promise<CompetitionEntryListDto> {
    const competition = await this.prisma.competition.findFirst({
      where: { id: competitionId, deletedAt: null },
    });
    if (!competition) {
      throw new NotFoundException('Compétition introuvable.');
    }
    await this.assertReadable(user, competition);
    const rows = await this.prisma.competitionEntry.findMany({
      where: { competitionId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return { data: rows.map((r) => toCompetitionEntryDto(r)) };
  }

  /** Désengagement (soft-delete) d'un athlète. Coach propriétaire uniquement. */
  async unengageAthlete(coachId: string, competitionId: string, entryId: string): Promise<void> {
    await this.ownership.assertCompetitionOwnedByCoach(coachId, competitionId);
    const entry = await this.prisma.competitionEntry.findFirst({
      where: { id: entryId, competitionId, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      throw new NotFoundException('Engagement introuvable.');
    }
    await this.prisma.competitionEntry.update({
      where: { id: entryId },
      data: { deletedAt: new Date() },
    });
  }

  /** 403 si l'utilisateur n'est ni propriétaire de la compétition ni athlète engagé. */
  private async assertReadable(user: AuthenticatedUser, competition: Competition): Promise<void> {
    if (user.role === 'coach') {
      if (competition.coachId !== user.id) {
        throw new ForbiddenException('Cette compétition ne vous appartient pas.');
      }
      return;
    }
    const entry = await this.prisma.competitionEntry.findFirst({
      where: { competitionId: competition.id, athleteId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!entry) {
      throw new ForbiddenException("Vous n'êtes pas engagé à cette compétition.");
    }
  }
}

/**
 * Crée l'engagement actif (compétition, athlète) ou renvoie l'existant tel quel
 * (idempotence : un ré-engagement ne modifie pas un engagement déjà en cours).
 */
async function upsertActiveEntry(
  tx: Prisma.TransactionClient,
  competitionId: string,
  athleteId: string,
  eventLabel: string | null,
): Promise<CompetitionEntry> {
  const existing = await tx.competitionEntry.findFirst({
    where: { competitionId, athleteId, deletedAt: null },
  });
  if (existing) {
    return existing;
  }
  return tx.competitionEntry.create({
    data: { competitionId, athleteId, eventLabel: eventLabel ?? undefined },
  });
}
