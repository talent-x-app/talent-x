import { Prisma } from '@prisma/client';
import type { ExercisesDocDto } from './dto/exercises.dto';

/**
 * Version courante du contrat JSONB `exercises` des séances.
 *
 * **v3 = groupes d'exercices** (tours/séries, supersets/circuits) — cf. ADR-27 ;
 * v2 = blocs typés par discipline (ADR-18), v1 = blocs génériques. Le passage à v3
 * a été livré côté backend (DTO `ExerciseGroupDto`) et côté constructeur mobile, qui
 * sérialise déjà `schemaVersion: 3`.
 *
 * **Source unique côté API** : importée par tous les services qui sérialisent un
 * `ExercisesDoc` (séances + journal d'entraînement) → un seul point à incrémenter lors
 * d'une évolution de schéma, plus de littéral dupliqué. Le contrat
 * (`docs/talent-x-openapi.yaml`, schéma `ExercisesDoc`) reste la **source de vérité
 * documentaire** ; cette constante n'est que le défaut de sérialisation appliqué quand
 * le client omet `schemaVersion`.
 */
export const EXERCISES_SCHEMA_VERSION = 3;

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
 * comme repli pour d'éventuelles lignes héritées sans tag. Défaut = version courante du
 * contrat (`EXERCISES_SCHEMA_VERSION` = v3, groupes — ADR-27) quand le client omet `schemaVersion`.
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
