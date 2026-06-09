import type { Session } from '@prisma/client';
import { SessionDto } from './dto/session.dto';
import { BlockType, type ExerciseDto, type ExercisesDocDto } from './dto/exercises.dto';
import type { SessionStatus } from './dto/session-create.dto';

/**
 * Normalise un bloc lu en base : un bloc hérité v1 sans `type` est exposé comme
 * `custom` (variante générique, rétro-compat — cf. ADR-18).
 */
function normalizeBlock(item: ExerciseDto): ExerciseDto {
  return item.type != null ? item : { ...item, type: BlockType.Custom };
}

/** Mappe une ligne `Session` Prisma vers le DTO `Session` du contrat (partagé). */
export function toSessionDto(session: Session): SessionDto {
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
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
