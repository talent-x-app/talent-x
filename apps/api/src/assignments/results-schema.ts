import { Prisma } from '@prisma/client';
import type { ResultsDocDto } from './dto/results.dto';

/**
 * Version courante du contrat JSONB des résultats de performance — **v2** (ADR-19 :
 * mesures chronométriques/distance par essai). Sert de **défaut de repli** quand le
 * client n'étiquette pas son document (le mobile envoie toujours `2`).
 */
export const RESULTS_SCHEMA_VERSION = 2;

/** Champs d'écriture d'une performance : colonne + JSONB, dérivés d'**une** version. */
export interface ResultsWrite {
  results: Prisma.InputJsonValue;
  resultsSchemaVersion: number;
}

/**
 * Sérialise un `ResultsDoc` pour l'écriture : la colonne `results_schema_version`
 * **et** le `schemaVersion` du JSONB sont posés depuis la **même** version résolue
 * → colonne et document toujours cohérents (TLX-144). Le JSONB reste la source de
 * vérité (lu en premier par le mapper) ; la colonne en est le reflet.
 */
export function serializeResults(doc: ResultsDocDto): ResultsWrite {
  const schemaVersion = doc.schemaVersion ?? RESULTS_SCHEMA_VERSION;
  return {
    resultsSchemaVersion: schemaVersion,
    results: {
      schemaVersion,
      items: doc.items as unknown as Prisma.InputJsonValue[],
    },
  };
}
