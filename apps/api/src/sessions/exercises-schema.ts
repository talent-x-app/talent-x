import { Prisma } from '@prisma/client';
import type { ExercisesDocDto } from './dto/exercises.dto';

/**
 * Version courante du contrat JSONB des séances (TX-DATA-006 §9.1, ADR-18) —
 * **défaut de repli** quand le client n'étiquette pas son document.
 */
export const EXERCISES_SCHEMA_VERSION = 2;

/** Champs d'écriture d'une séance : colonne + JSONB, dérivés d'**une** version. */
export interface ExercisesWrite {
  exercises: Prisma.InputJsonValue;
  exercisesSchemaVersion: number;
}

/**
 * Sérialise un `ExercisesDoc` pour l'écriture : la colonne `exercises_schema_version`
 * **et** le `schemaVersion` du JSONB sont posés depuis la **même** version résolue
 * → la colonne ne peut plus diverger du document (TLX-144). Le JSONB reste la source
 * de vérité (lu en premier par le mapper) ; la colonne en est le reflet fidèle, utile
 * comme repli pour d'éventuelles lignes héritées sans tag.
 */
export function serializeExercises(doc: ExercisesDocDto): ExercisesWrite {
  const schemaVersion = doc.schemaVersion ?? EXERCISES_SCHEMA_VERSION;
  return {
    exercisesSchemaVersion: schemaVersion,
    exercises: {
      schemaVersion,
      items: doc.items as unknown as Prisma.InputJsonValue[],
    },
  };
}

/**
 * Version d'une séance **déjà stockée** (duplication). Le tag du JSONB fait foi
 * (même précédence que le mapper) ; la colonne n'est qu'un repli. Garantit qu'une
 * copie porte une colonne cohérente avec le document copié, même si la source est
 * une ligne héritée dont la colonne était restée au défaut.
 */
export function storedExercisesSchemaVersion(stored: {
  exercises: unknown;
  exercisesSchemaVersion: number;
}): number {
  const tagged = (stored.exercises as { schemaVersion?: number } | null)?.schemaVersion;
  return tagged ?? stored.exercisesSchemaVersion;
}
