/**
 * Récurrence d'assignation (ADR-35) — génération d'occurrences datées.
 *
 * Module **pur** (aucune dépendance Nest/Prisma) : à partir d'une première échéance
 * (`dueDate`) et d'une date de fin (`until`), produit la suite des dates hebdomadaires
 * (`dueDate`, `+7 j`, `+14 j`, …) tant qu'elles restent `≤ until`, sur le **même jour de
 * semaine** que `dueDate`. Cadence MVP = hebdomadaire (ADR-35 §3, enum extensible plus tard).
 *
 * Tout est calculé en **UTC**, aligné sur les `dueDate` calendaires (YYYY-MM-DD) du reste de
 * l'app : les dates n'ont pas d'heure et l'ajout de 7 jours ne traverse jamais un fuseau.
 */

/** Borne dure : au plus une année d'occurrences hebdomadaires (ADR-35 §3). */
export const RECURRENCE_MAX_OCCURRENCES = 52;

/** Parse une date calendaire `YYYY-MM-DD` en `Date` à minuit UTC (heure ignorée). */
function parseUtcDate(date: string): Date {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formate une `Date` en date calendaire `YYYY-MM-DD` (UTC). */
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Dates des occurrences hebdomadaires de `dueDate` (incluse) jusqu'à `until` (incluse).
 *
 * - `until < dueDate` → tableau **vide** (le service en fait un 422 `INVALID_RECURRENCE`).
 * - Génère au plus `max + 1` dates : le `+1` permet au service de **détecter un dépassement**
 *   (`> max` → 422 `RECURRENCE_TOO_LONG`) sans matérialiser des milliers de dates pour une
 *   date de fin absurde. La première occurrence est toujours `dueDate` elle-même.
 */
export function occurrenceDates(
  dueDate: string,
  until: string,
  max: number = RECURRENCE_MAX_OCCURRENCES,
): string[] {
  const end = parseUtcDate(until).getTime();
  const cursor = parseUtcDate(dueDate);
  const dates: string[] = [];
  while (cursor.getTime() <= end && dates.length <= max) {
    dates.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }
  return dates;
}
