import type { Session } from '@prisma/client';
import { SessionDto } from './dto/session.dto';
import { BlockType, type ExerciseDto, type ExercisesDocDto } from './dto/exercises.dto';
import type { SessionBriefDto } from './dto/session-brief.dto';
import type { SessionStatus } from './dto/session-create.dto';
import type { Role } from '../common/decorators/roles.decorator';

/**
 * Normalise un bloc lu en base : un bloc hérité v1 sans `type` est exposé comme
 * `custom` (variante générique, rétro-compat — cf. ADR-18).
 */
function normalizeBlock(item: ExerciseDto): ExerciseDto {
  return item.type != null ? item : { ...item, type: BlockType.Custom };
}

/**
 * Construit le sous-document `brief` exposé selon le **rôle du lecteur** (ADR-28).
 * Pour un athlète, `intent` (intention du jour) et `coachNotes` (notes internes) sont
 * retirés : filtrage **serveur**, jamais côté client (minimisation, philosophie ADR-26).
 * `brief` absent (NULL) → `undefined` : la séance reste valide sans couche éditoriale.
 */
function toBriefDto(brief: unknown, role: Role): SessionBriefDto | undefined {
  if (brief == null || typeof brief !== 'object') {
    return undefined;
  }
  const doc = { ...(brief as Record<string, unknown>) } as SessionBriefDto;
  if (role === 'athlete') {
    delete doc.intent;
    delete doc.coachNotes;
  }
  return doc;
}

/**
 * Mappe une ligne `Session` Prisma vers le DTO `Session` du contrat (partagé).
 * `role` = rôle du **lecteur** : conditionne la double lecture du brief (ADR-28).
 */
export function toSessionDto(session: Session, role: Role): SessionDto {
  const exercises = (session.exercises as { schemaVersion?: number; items?: unknown[] }) ?? {};
  const items = (exercises.items ?? []) as ExerciseDto[];
  return {
    id: session.id,
    title: session.title,
    description: session.description ?? undefined,
    scheduledDate: session.scheduledDate
      ? session.scheduledDate.toISOString().slice(0, 10)
      : undefined,
    status: session.status as SessionStatus,
    coachId: session.coachId,
    exercises: {
      schemaVersion: exercises.schemaVersion ?? session.exercisesSchemaVersion,
      items: items.map(normalizeBlock) as ExercisesDocDto['items'],
    },
    brief: toBriefDto(session.brief, role),
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
