import { AssignmentStatus, type Assignment } from '@talent-x/api-client';
import { assignmentDate } from './home-model';

/**
 * Dérivations d'assiduité athlète (TLX-115) — gamification légère de la rétention.
 * **Aucun endpoint dédié, aucun contrat** : on dérive des affectations déjà en cache
 * (`['assignments']`, partagé A-01/A-02/calendrier) deux signaux motivants :
 *   - la **série** (`streak`) de semaines consécutives entièrement réalisées ;
 *   - le **taux de complétion du mois** courant.
 *
 * Conventions, alignées sur le reste de l'app :
 *   - `skipped` est **exclu du dénominateur** (ADR-31, TLX-108 : une séance signalée
 *     « je ne peux pas » ne compte ni en faveur ni en défaveur de l'assiduité) ;
 *   - le découpage temporel se fait en **UTC**, comme les bornes de jour du backend ;
 *   - la **semaine commence le lundi** (convention FR) ;
 *   - une affectation n'est **évaluable** que si elle est échue (réalisée, ou datée
 *     d'aujourd'hui ou avant) : les séances **futures** ne pénalisent pas encore l'athlète.
 *
 * Choix produit assumé (hors spec, propre à cette gamification) : seules les **semaines
 * actives** (≥ 1 affectation évaluable) comptent. Une semaine sans rien de programmé est
 * « transparente » — elle ne rompt pas la série (l'athlète n'est pas pénalisé d'un trou
 * laissé par le coach), pas plus qu'elle ne l'allonge.
 */

export interface Attendance {
  /** Semaines actives consécutives entièrement réalisées, en remontant depuis la plus récente. */
  currentStreakWeeks: number;
  /** Plus longue série de semaines actives entièrement réalisées (records personnels de régularité). */
  bestStreakWeeks: number;
  /** Affectations évaluables réalisées ce mois-ci. */
  monthCompleted: number;
  /** Affectations évaluables ce mois-ci (réalisées + à faire échues, hors skipped). */
  monthTotal: number;
  /** Taux de complétion du mois (0..1) ; 0 quand aucune affectation évaluable ce mois. */
  monthCompletionRate: number;
}

const EMPTY: Attendance = {
  currentStreakWeeks: 0,
  bestStreakWeeks: 0,
  monthCompleted: 0,
  monthTotal: 0,
  monthCompletionRate: 0,
};

/** Numéro de jour UTC (jours depuis l'époque) — pour comparer des dates au grain du jour. */
function utcDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/** Date de référence d'une affectation, parsée ; `null` si absente ou invalide. */
function referenceDate(assignment: Assignment): Date | null {
  const iso = assignmentDate(assignment);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Une affectation **compte** dans l'assiduité si elle n'est pas `skipped`, est datée, et est
 * échue : soit réalisée (elle compte même si datée dans le futur — saisie en avance), soit
 * dont le jour de référence est aujourd'hui ou passé. Les séances futures non faites sont ignorées.
 */
export function isEvaluable(assignment: Assignment, now: Date): boolean {
  if (assignment.status === AssignmentStatus.skipped) return false;
  const ref = referenceDate(assignment);
  if (!ref) return false;
  if (assignment.status === AssignmentStatus.completed) return true;
  return utcDayNumber(ref) <= utcDayNumber(now);
}

/** Clé de semaine ISO (lundi UTC, `YYYY-MM-DD`) de la semaine contenant `date`. */
export function weekKey(date: Date): string {
  // getUTCDay : 0 = dimanche … 6 = samedi → décalage vers le lundi précédent.
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday),
  );
  return monday.toISOString().slice(0, 10);
}

/** `true` si `date` tombe dans le même mois calendaire UTC que `now`. */
function sameUtcMonth(date: Date, now: Date): boolean {
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
}

/**
 * Dérive l'assiduité (`now` injecté → déterministe). Ne lit que des affectations déjà chargées,
 * tolère les champs manquants (lecture défensive), n'émet jamais d'exception.
 */
export function computeAttendance(list: Assignment[], now: Date): Attendance {
  const evaluable = list.filter((a) => isEvaluable(a, now));
  if (evaluable.length === 0) return EMPTY;

  // Taux du mois courant.
  let monthCompleted = 0;
  let monthTotal = 0;
  for (const a of evaluable) {
    const ref = referenceDate(a);
    if (ref && sameUtcMonth(ref, now)) {
      monthTotal += 1;
      if (a.status === AssignmentStatus.completed) monthCompleted += 1;
    }
  }

  // Bilan par semaine active.
  const weeks = new Map<string, { total: number; completed: number }>();
  for (const a of evaluable) {
    const ref = referenceDate(a);
    if (!ref) continue;
    const key = weekKey(ref);
    const bucket = weeks.get(key) ?? { total: 0, completed: 0 };
    bucket.total += 1;
    if (a.status === AssignmentStatus.completed) bucket.completed += 1;
    weeks.set(key, bucket);
  }

  // Semaines actives, du plus ancien au plus récent ; une semaine est « complète » si
  // toutes ses affectations évaluables sont réalisées. « Consécutif » = adjacent dans cette
  // liste de semaines actives (les semaines sans activité, absentes, sont sautées).
  const complete = [...weeks.keys()]
    .sort()
    .map((k) => weeks.get(k)!.completed === weeks.get(k)!.total);

  let bestStreakWeeks = 0;
  let run = 0;
  for (const isComplete of complete) {
    run = isComplete ? run + 1 : 0;
    if (run > bestStreakWeeks) bestStreakWeeks = run;
  }

  // Série courante : suite de semaines complètes en partant de la plus récente.
  let currentStreakWeeks = 0;
  for (let i = complete.length - 1; i >= 0 && complete[i]; i -= 1) currentStreakWeeks += 1;

  return {
    currentStreakWeeks,
    bestStreakWeeks,
    monthCompleted,
    monthTotal,
    monthCompletionRate: monthTotal === 0 ? 0 : monthCompleted / monthTotal,
  };
}

/** `true` si l'athlète a au moins une affectation évaluable (assez de données pour afficher l'assiduité). */
export function hasAttendanceSignal(list: Assignment[], now: Date): boolean {
  return list.some((a) => isEvaluable(a, now));
}
