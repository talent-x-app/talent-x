import type { Competition, CompetitionEntry } from '@prisma/client';
import { CompetitionDto } from './dto/competition.dto';
import { CompetitionStatus } from './dto/competition-create.dto';
import { CompetitionEntryDto, CompetitionEntryStatus } from './dto/competition-entry.dto';

/** Mappe une ligne `Competition` Prisma vers le DTO du contrat. */
export function toCompetitionDto(c: Competition): CompetitionDto {
  return {
    id: c.id,
    coachId: c.coachId,
    name: c.name,
    discipline: c.discipline ?? undefined,
    location: c.location ?? undefined,
    startDate: c.startDate.toISOString().slice(0, 10),
    endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : undefined,
    description: c.description ?? undefined,
    status: c.status as CompetitionStatus,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Mappe une ligne `CompetitionEntry` Prisma (compétition embarquée optionnelle) vers le DTO. */
export function toCompetitionEntryDto(
  entry: CompetitionEntry,
  competition?: Competition,
): CompetitionEntryDto {
  return {
    id: entry.id,
    competitionId: entry.competitionId,
    athleteId: entry.athleteId,
    eventLabel: entry.eventLabel ?? undefined,
    status: entry.status as CompetitionEntryStatus,
    competition: competition ? toCompetitionDto(competition) : undefined,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}
