import { BlockType, type Exercise, type PersonalRecord } from '@talent-x/api-client';
import { formatExerciseTarget } from './exercise-target';
import { formatRecordValue } from '../athlete/perf-entry';

/**
 * Cibles individualisées (TLX-161, ADR-38/ADR-20) — module pur, dérivation de lecture seule.
 *
 * Une intensité prescrite en `% record` (`intensityMode: 'percent_record'`) n'a de sens concret
 * que rapportée au record personnel de l'athlète assigné : ce module recalcule la cible
 * (`target = record / (intensité/100)` — 95 % d'un record de 7,32 s ⇒ ≈ 7,71 s, plus lent que
 * le record) pour la « Vue athlète » du détail d'affectation. Aucun stockage : la clé d'épreuve
 * est recomposée comme la fabrique canonique backend (`record-detection.ts`, ADR-20/32) —
 * `sprint:60m`, `hurdles:110m`… — et cherchée dans les records déjà en cache (`['records','me']`).
 * Repli propre : sans record correspondant (ou hors familles chronométrées), l'affichage reste
 * la prescription du coach.
 */

/** Familles chronométrées (record en secondes, direction min) — aligné `record-detection.ts`. */
const TIMED_FAMILY: Partial<Record<BlockType, string>> = {
  [BlockType.sprint]: 'sprint',
  [BlockType.hurdles]: 'hurdles',
  [BlockType.endurance]: 'endurance',
  [BlockType.interval]: 'interval',
};

export type SessionView = 'coach' | 'athlete';

/** Lecture défensive d'un param numérique strictement positif (conteneur libre, ADR-18). */
function positiveParam(params: Exercise['params'], key: string): number | undefined {
  const v = (params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Lecture défensive d'un param texte. */
function strParam(params: Exercise['params'], key: string): string | undefined {
  const v = (params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/**
 * Clé d'épreuve canonique d'un exercice chronométré (`sprint:60m`…), `undefined` si le bloc
 * n'est pas d'une famille chronométrée ou sans distance exploitable.
 */
export function exerciseEventKey(ex: Exercise): string | undefined {
  const family = ex.type != null ? TIMED_FAMILY[ex.type] : undefined;
  const distance = positiveParam(ex.params, 'distanceMeters');
  if (!family || distance == null) return undefined;
  return `${family}:${distance}m`;
}

/** Intensité `% record` prescrite (0 < v), `undefined` si l'exercice n'en porte pas. */
export function percentRecordIntensity(ex: Exercise): number | undefined {
  if (strParam(ex.params, 'intensityMode') !== 'percent_record') return undefined;
  return positiveParam(ex.params, 'intensityValue');
}

export interface IndividualizedTarget {
  /** Cible individualisée (secondes, arrondie au centième). */
  seconds: number;
  /** Record personnel de référence (secondes). */
  recordSeconds: number;
  /** Intensité prescrite (%). */
  percent: number;
}

/**
 * Cible individualisée d'un exercice `% record`, dérivée du record personnel correspondant.
 * `undefined` si non dérivable (pas d'intensité `% record`, épreuve non chronométrée, aucun
 * record pour la clé) — le repli d'affichage reste la prescription.
 */
export function individualizedTarget(
  ex: Exercise,
  records: PersonalRecord[],
): IndividualizedTarget | undefined {
  const percent = percentRecordIntensity(ex);
  if (percent == null) return undefined;
  const eventKey = exerciseEventKey(ex);
  if (eventKey == null) return undefined;
  const record = records.find((r) => r.eventKey === eventKey && r.unit === 's' && r.value > 0);
  if (!record) return undefined;
  return {
    seconds: Math.round((record.value / (percent / 100)) * 100) / 100,
    recordSeconds: record.value,
    percent,
  };
}

/** Vrai si au moins un exercice de la liste porte une intensité `% record` (bascule utile). */
export function hasPercentRecordTargets(exercises: Exercise[]): boolean {
  return exercises.some((ex) => percentRecordIntensity(ex) != null);
}

/**
 * Cible affichée selon la vue (TLX-161) :
 * - **Vue coach** : prescription (`… · 95 % record`) ;
 * - **Vue athlète** : cible recalculée (`… · ≈ 7.71 s`), repli sur la prescription si non
 *   dérivable (pas de record pour l'épreuve — jamais d'erreur).
 * Sans intensité `% record`, les deux vues rendent la cible standard (identiques).
 */
export function formatTargetForView(
  ex: Exercise,
  view: SessionView,
  records: PersonalRecord[],
): string {
  const base = formatExerciseTarget(ex);
  const percent = percentRecordIntensity(ex);
  if (percent == null) return base;
  const prescription = `${percent} % record`;
  if (view === 'athlete') {
    const target = individualizedTarget(ex, records);
    if (target) return joinTarget(base, `≈ ${formatRecordValue(target.seconds, 's')}`);
  }
  return joinTarget(base, prescription);
}

/** Concatène la base (« 3 × 60m ») et le fragment d'intensité, en tolérant la base vide (« — »). */
function joinTarget(base: string, fragment: string): string {
  return base === '—' ? fragment : `${base} · ${fragment}`;
}
