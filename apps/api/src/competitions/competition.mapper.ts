import type { Competition, CompetitionEntry } from '@prisma/client';
import { CompetitionDto } from './dto/competition.dto';
import { CompetitionStatus } from './dto/competition-create.dto';
import { CompetitionEntryDto, CompetitionEntryStatus } from './dto/competition-entry.dto';

/**
 * Mappe une ligne `Competition` Prisma vers le DTO du contrat.
 * `viewerEntryStatus` (optionnel) porte le statut d'engagement du demandeur quand c'est
 * l'athlète engagé (TLX-92) — toujours absent côté coach propriétaire.
 */
export function toCompetitionDto(
  c: Competition,
  viewerEntryStatus?: CompetitionEntryStatus,
): CompetitionDto {
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
    viewerEntryStatus,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/**
 * Résume les engagements d'un athlète à une compétition en **un** statut d'affichage (TLX-92).
 * Un athlète peut avoir plusieurs engagements (plusieurs épreuves) → on retient le plus
 * « avancé » : confirmé > engagé > forfait. `undefined` si aucun engagement actif.
 */
export function summarizeEntryStatus(
  statuses: readonly string[],
): CompetitionEntryStatus | undefined {
  if (statuses.includes(CompetitionEntryStatus.Confirmed)) return CompetitionEntryStatus.Confirmed;
  if (statuses.includes(CompetitionEntryStatus.Engaged)) return CompetitionEntryStatus.Engaged;
  if (statuses.includes(CompetitionEntryStatus.Withdrawn)) return CompetitionEntryStatus.Withdrawn;
  return undefined;
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
