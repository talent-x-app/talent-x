/**
 * Monitoring de charge d'entraînement (TLX-113) — dérivation **pure** (testable
 * isolément, aucune dépendance Prisma/Nest). Méthode sRPE de Foster :
 *
 *  - **charge de séance (sRPE)** = RPE (1..10) × durée (minutes).
 *  - **charge aiguë** = somme des sRPE sur les 7 derniers jours.
 *  - **charge chronique** = moyenne hebdomadaire sur 28 jours = somme(28 j) / 4.
 *  - **ACWR** (acute:chronic workload ratio) = aiguë / chronique. Zone sûre 0.8–1.3 ;
 *    < 0.8 = sous-charge (désentraînement), > 1.3 = surcharge (risque de blessure). Rendu
 *    seulement au-delà de `ACWR_MIN_HISTORY_DAYS` d'historique (TLX-260) — sans quoi le ratio
 *    vaut arithmétiquement 4,00 pour tout le monde.
 *  - **monotonie** = moyenne / écart-type des charges quotidiennes (7 j).
 *  - **contrainte (strain)** = charge hebdo × monotonie.
 *
 * La durée provient de la séance **planifiée** (`brief.durationMinutes`, à défaut la
 * somme des `durationSeconds` des blocs) — décision TLX-113 : aucune donnée nouvelle.
 */

/** Une charge de séance datée (sRPE positif). */
export interface LoadPoint {
  date: Date;
  load: number;
}

/** Zone d'interprétation de l'ACWR. */
export type LoadZone = 'insufficient' | 'underload' | 'optimal' | 'overload';

/** Synthèse de charge d'un athlète à une date de référence. */
export interface TrainingLoad {
  /** Charge aiguë (somme sRPE 7 j). */
  acute: number;
  /** Charge chronique (moyenne hebdo sur 28 j). */
  chronic: number;
  /** Ratio aigu:chronique, arrondi à 0,01 ; `null` si chronique nulle. */
  acwr: number | null;
  /** Interprétation de l'ACWR (cf. zone sûre 0.8–1.3). */
  zone: LoadZone;
  /** Charge de la semaine en cours (= charge aiguë). */
  weeklyLoad: number;
  /** Monotonie (moyenne/écart-type des charges quotidiennes, 7 j) ; `null` si indéfinie. */
  monotony: number | null;
  /** Contrainte = charge hebdo × monotonie ; `null` si monotonie indéfinie. */
  strain: number | null;
  /** Nombre de séances chargées prises en compte (28 j). */
  sessions: number;
}

/** Bornes de la zone sûre d'ACWR (consensus sports science). */
export const ACWR_OPTIMAL_MIN = 0.8;
export const ACWR_OPTIMAL_MAX = 1.3;

/**
 * Historique minimal exigé avant de rendre un ACWR — **28 jours** (TLX-260, seuil tranché par le
 * propriétaire le 21/08/2026). Le seuil coïncide avec la fenêtre chronique, et c'est la raison
 * d'être du garde : tant que l'historique tient dans les 7 derniers jours, `acute === chronic28`,
 * donc `acwr = acute / (acute / 4) = 4,00` — **quelle que soit la charge**. Deux athlètes dont les
 * charges vont de 1 à 5 affichaient le même 4,00, et 4,00 > 1,3 classait en « Surcharge » tout
 * athlète de moins d'une semaine d'ancienneté. Une alarme permanente ne prévient de rien.
 *
 * Mesuré sur **l'ancienneté de la plus ancienne séance chargée**, et non sur la date de création
 * du compte ni sur le nombre de séances : un athlète inscrit depuis 40 jours dont la première
 * séance chargée date d'hier n'a pas plus d'historique qu'un athlète inscrit hier.
 */
export const ACWR_MIN_HISTORY_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Minuit UTC du jour de `d` (bucket calendaire, aligné sur les dérivations dashboard). */
function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Charge d'une séance (sRPE = RPE × durée). Retourne `null` si une donnée manque ou
 * est non exploitable (pas de RPE, durée nulle/absente) — la séance ne compte alors
 * pas dans la charge (lecture défensive, jamais d'exception).
 */
export function sessionLoad(
  rpe: number | null | undefined,
  durationMinutes: number | null | undefined,
): number | null {
  if (rpe == null || durationMinutes == null) return null;
  if (!(rpe > 0) || !(durationMinutes > 0)) return null;
  return rpe * durationMinutes;
}

/**
 * Durée planifiée d'une séance, en minutes : `brief.durationMinutes` en priorité,
 * sinon la somme des `durationSeconds` des blocs d'exercices (÷ 60, arrondie).
 * `null` si aucune source exploitable. Lecture défensive des conteneurs JSON libres.
 */
export function plannedDurationMinutes(
  brief: { durationMinutes?: number | null } | null | undefined,
  exercises: { items?: { durationSeconds?: number | null }[] } | null | undefined,
): number | null {
  const fromBrief = brief?.durationMinutes;
  if (typeof fromBrief === 'number' && fromBrief > 0) return fromBrief;
  const items = exercises?.items;
  if (Array.isArray(items)) {
    const seconds = items.reduce(
      (sum, it) => sum + (typeof it?.durationSeconds === 'number' ? it.durationSeconds : 0),
      0,
    );
    if (seconds > 0) return Math.round(seconds / 60);
  }
  return null;
}

/**
 * Calcule la synthèse de charge à la date `now` à partir des charges de séance datées.
 * Pur et déterministe (`now` injecté). Les points hors fenêtre 28 j sont ignorés.
 */
export function computeTrainingLoad(points: LoadPoint[], now: Date): TrainingLoad {
  const nowMs = now.getTime();
  const acuteFrom = nowMs - 7 * DAY_MS;
  const chronicFrom = nowMs - 28 * DAY_MS;

  let acute = 0;
  let chronic28 = 0;
  let sessions = 0;
  // Charges quotidiennes des 7 derniers jours (7 buckets) pour la monotonie.
  const daily = new Map<number, number>();
  // Plus ancienne séance chargée, **toutes fenêtres confondues** : c'est elle qui mesure
  // l'historique (TLX-260). Les points antérieurs à 28 j ne comptent pas dans les charges mais
  // prouvent l'ancienneté — les ignorer ici reviendrait à ne jamais franchir le seuil.
  let oldestLoadedMs: number | null = null;

  for (const p of points) {
    const t = p.date.getTime();
    if (!(p.load > 0) || t > nowMs) continue;
    if (oldestLoadedMs == null || t < oldestLoadedMs) oldestLoadedMs = t;
    if (t <= chronicFrom) continue;
    chronic28 += p.load;
    sessions += 1;
    if (t > acuteFrom) {
      acute += p.load;
      const day = startOfUtcDay(p.date);
      daily.set(day, (daily.get(day) ?? 0) + p.load);
    }
  }

  const chronic = chronic28 / 4;
  // Précondition du ratio (TLX-260) : la moyenne « sur 28 jours » ne porte réellement sur 28 jours
  // qu'à partir du moment où l'athlète a 28 jours d'historique. Avant, elle divise par 4 une somme
  // qui n'en couvre qu'une fraction — d'où le 4,00 constant. Pas d'historique suffisant, pas de
  // ratio : `null`, que `classifyZone` traduit en `insufficient`.
  const hasEnoughHistory =
    oldestLoadedMs != null && nowMs - oldestLoadedMs >= ACWR_MIN_HISTORY_DAYS * DAY_MS;
  const acwr = hasEnoughHistory && chronic > 0 ? round(acute / chronic, 2) : null;

  // Monotonie sur 7 jours calendaires pleins (jours sans séance = charge 0).
  const dayValues: number[] = [];
  const today = startOfUtcDay(now);
  for (let i = 0; i < 7; i += 1) {
    dayValues.push(daily.get(today - i * DAY_MS) ?? 0);
  }
  const mean = dayValues.reduce((s, v) => s + v, 0) / dayValues.length;
  const variance = dayValues.reduce((s, v) => s + (v - mean) ** 2, 0) / dayValues.length;
  const std = Math.sqrt(variance);
  // Monotonie définie seulement si variabilité ET charge non nulles.
  const monotony = std > 0 && mean > 0 ? round(mean / std, 2) : null;
  const strain = monotony != null ? Math.round(acute * monotony) : null;

  return {
    acute: Math.round(acute),
    chronic: Math.round(chronic),
    acwr,
    zone: classifyZone(acwr, chronic28),
    weeklyLoad: Math.round(acute),
    monotony,
    strain,
    sessions,
  };
}

/**
 * Zone d'ACWR. `insufficient` si le ratio n'est pas rendu (charge chronique nulle, ou historique
 * sous `ACWR_MIN_HISTORY_DAYS` — cf. `computeTrainingLoad`) ; sinon sous-charge / optimal /
 * surcharge selon la zone sûre. Cette fonction **classe un ratio** ; c'est l'appelant qui décide
 * si un ratio est mesurable (TLX-260).
 */
export function classifyZone(acwr: number | null, chronic28Total: number): LoadZone {
  if (acwr == null || chronic28Total <= 0) return 'insufficient';
  if (acwr < ACWR_OPTIMAL_MIN) return 'underload';
  if (acwr > ACWR_OPTIMAL_MAX) return 'overload';
  return 'optimal';
}
