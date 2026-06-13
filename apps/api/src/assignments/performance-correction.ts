import type { Performance, Prisma } from '@prisma/client';

/**
 * Historisation des corrections de performance (ADR-33, RB-06).
 *
 * Une correction (`PUT` sur une perf déjà soumise) écrasait jusqu'ici la valeur en place.
 * On en conserve désormais une trace `audit_log` (`action='performance.correction'`,
 * `metadata={before,after}`), écrite **dans la même transaction** que l'update. Ce module
 * isole la logique pure : extraire le snapshot comparable d'une perf et décider s'il y a
 * matière à tracer (un `PUT` idempotent identique → pas de trace vide).
 */

/** Action d'audit d'une correction de performance (ADR-33). */
export const PERFORMANCE_CORRECTION_ACTION = 'performance.correction';

/** Champs d'une performance susceptibles d'être corrigés — la matière historisée. */
export interface PerformanceSnapshot {
  results: Prisma.JsonValue;
  resultsSchemaVersion: number;
  rpe: number | null;
  notes: string | null;
}

type CorrectablePerformance = Pick<
  Performance,
  'results' | 'resultsSchemaVersion' | 'rpe' | 'notes'
>;

/** Snapshot comparable des champs corrigeables d'une perf (RPE/notes normalisés en `null`). */
export function performanceSnapshot(perf: CorrectablePerformance): PerformanceSnapshot {
  return {
    results: perf.results,
    resultsSchemaVersion: perf.resultsSchemaVersion,
    rpe: perf.rpe ?? null,
    notes: perf.notes ?? null,
  };
}

/**
 * Diff de correction entre l'avant et l'après d'un `update`. Renvoie `{ before, after }` si
 * **au moins un** champ corrigeable change, sinon `null` (PUT identique → aucune trace).
 * `results` (jsonb) est comparé par sérialisation : avant/après proviennent tous deux de la
 * base (normalisés par Postgres), la comparaison est donc stable.
 */
export function correctionAudit(
  before: CorrectablePerformance,
  after: CorrectablePerformance,
): { before: PerformanceSnapshot; after: PerformanceSnapshot } | null {
  const b = performanceSnapshot(before);
  const a = performanceSnapshot(after);
  return snapshotsEqual(b, a) ? null : { before: b, after: a };
}

function snapshotsEqual(a: PerformanceSnapshot, b: PerformanceSnapshot): boolean {
  return (
    a.resultsSchemaVersion === b.resultsSchemaVersion &&
    a.rpe === b.rpe &&
    a.notes === b.notes &&
    JSON.stringify(a.results) === JSON.stringify(b.results)
  );
}
