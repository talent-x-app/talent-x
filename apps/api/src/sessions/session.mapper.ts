import type { Session } from '@prisma/client';
import { SessionDto } from './dto/session.dto';
import type { ExercisesDocDto } from './dto/exercises.dto';
import type { SessionStatus } from './dto/session-create.dto';

/** Mappe une ligne `Session` Prisma vers le DTO `Session` du contrat (partagé). */
export function toSessionDto(session: Session): SessionDto {
  const exercises = (session.exercises as { schemaVersion?: number; items?: unknown[] }) ?? {};
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
      items: (exercises.items ?? []) as ExercisesDocDto['items'],
    },
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
