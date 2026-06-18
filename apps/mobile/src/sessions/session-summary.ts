import { LoadUnit, type Exercise } from '@talent-x/api-client';
import { isExerciseGroup, type ExerciseNode } from './exercises-doc';

/**
 * Dérivations d'affichage d'une séance (ADR-38, TLX-160) — fonctions **pures**, rien de
 * persisté. Produisent une « phrase » condensée (ex. « 2 × (30·40·50 m) + 3 × (100·100 m) »)
 * et des KPIs agrégés (nombre d'efforts, volume en distance) à partir des `exercises.items`
 * (groupes `series` ADR-27 × feuilles typées). Dégradation propre sur une structure hétérogène.
 */

/** Lecture défensive d'un param numérique (conteneur `params` libre, cf. ADR-18). */
function num(params: Exercise['params'], key: string): number | undefined {
  const v = (params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Mesure compacte d'une feuille pour la phrase : valeur + unité (distance > durée > reps). */
function leafToken(ex: Exercise): { value: string; unit?: string } | undefined {
  const distance = num(ex.params, 'distanceMeters');
  if (distance != null) return { value: String(distance), unit: 'm' };
  const work = num(ex.params, 'workSeconds') ?? ex.durationSeconds ?? undefined;
  if (work != null) return { value: String(work), unit: 's' };
  if (ex.reps != null) return { value: `${ex.reps}×` };
  return undefined;
}

/** Nombre de tours d'un groupe (≥ 1). */
function groupRounds(rounds: number | undefined): number {
  return rounds && rounds > 0 ? rounds : 1;
}

/**
 * Segment de phrase pour une liste de feuilles répétées `rounds` fois. Factorise l'unité quand
 * toutes les feuilles la partagent (« 30·40·50 m ») ; sinon garde l'unité par valeur. `rounds`
 * n'est préfixé que s'il est > 1.
 */
function phraseSegment(leaves: Exercise[], rounds: number): string | undefined {
  const tokens = leaves.map(leafToken).filter((t): t is { value: string; unit?: string } => !!t);
  if (tokens.length === 0) return undefined;
  const units = new Set(tokens.map((t) => t.unit ?? ''));
  const body =
    units.size === 1
      ? `${tokens.map((t) => t.value).join('·')}${tokens[0].unit ? ` ${tokens[0].unit}` : ''}`
      : tokens.map((t) => `${t.value}${t.unit ?? ''}`).join('·');
  const inner = leaves.length > 1 ? `(${body})` : body;
  return rounds > 1 ? `${rounds} × ${inner}` : inner;
}

/**
 * Phrase condensée d'une séance (ex. « 2 × (30·40·50 m) + 3 × (100·100 m) »). Chaque groupe
 * `series` devient un segment `rounds × (…)` ; les feuilles de premier niveau sont regroupées
 * en un segment unitaire. Chaîne vide si rien d'exploitable.
 */
export function sessionPhrase(items: readonly ExerciseNode[] | undefined): string {
  const segments: string[] = [];
  let standalone: Exercise[] = [];
  const flushStandalone = () => {
    if (standalone.length === 0) return;
    const seg = phraseSegment(standalone, 1);
    if (seg) segments.push(seg);
    standalone = [];
  };
  for (const node of items ?? []) {
    if (isExerciseGroup(node)) {
      flushStandalone();
      const seg = phraseSegment(node.items ?? [], groupRounds(node.rounds));
      if (seg) segments.push(seg);
    } else if (node != null) {
      standalone.push(node);
    }
  }
  flushStandalone();
  return segments.join(' + ');
}

/** KPIs agrégés d'une séance : nombre d'efforts (tours × feuilles) et volume en distance (m). */
export interface SessionKpis {
  /** Nombre total d'efforts réalisés (un groupe de 3 feuilles × 2 tours = 6). */
  efforts: number;
  /** Volume cumulé en distance (somme des `distanceMeters` × tours), 0 si aucun. */
  distanceMeters: number;
}

/** Agrège les KPIs d'une séance (ADR-38). Tours pris en compte pour les feuilles de groupe. */
export function sessionKpis(items: readonly ExerciseNode[] | undefined): SessionKpis {
  let efforts = 0;
  let distanceMeters = 0;
  for (const node of items ?? []) {
    if (isExerciseGroup(node)) {
      const rounds = groupRounds(node.rounds);
      for (const leaf of node.items ?? []) {
        efforts += rounds;
        distanceMeters += (num(leaf.params, 'distanceMeters') ?? 0) * rounds;
      }
    } else if (node != null) {
      efforts += 1;
      distanceMeters += num(node.params, 'distanceMeters') ?? 0;
    }
  }
  return { efforts, distanceMeters: Math.round(distanceMeters) };
}

/** Volume en distance lisible (« 1,2 km » au-delà de 1000 m, sinon « 540 m »), ou `undefined`. */
export function formatDistanceVolume(meters: number): string | undefined {
  if (meters <= 0) return undefined;
  if (meters >= 1000) {
    const km = meters / 1000;
    return `${Number.isInteger(km) ? km : km.toFixed(1).replace('.', ',')} km`;
  }
  return `${meters} m`;
}

/** Badge de volume musculation/PPG (ADR-41 §5). */
export interface SessionTonnage {
  /**
   * Tonnage cumulé (kg) = Σ `effectif × reps × chargeKg`, **uniquement** quand la charge est en
   * `kg` (mode chiffrable sans référentiel). Les modes `% 1RM` / poids de corps / RPE / PPG en
   * durée ne sont pas convertis ici (la couche carte enrichit le %1RM via `ONE_RM_REFERENCE`).
   */
  tonnageKg: number;
  /** Repli : volume de répétitions = Σ `effectif × reps` sur les feuilles `strength`/`core`. */
  repVolume: number;
}

/** Une feuille porte-t-elle une charge explicite en kg ? → `value` (kg) sinon `undefined`. */
function loadKg(ex: Exercise): number | undefined {
  if (ex.load?.unit === LoadUnit.kg && typeof ex.load.value === 'number') return ex.load.value;
  return undefined;
}

/**
 * Agrège tonnage (kg) et volume de répétitions des feuilles `strength`/`core` (ADR-41 §5).
 * L'effectif d'une feuille est son `sets` (bloc top-level) ou, à défaut, le nombre de tours du
 * groupe parent (`rounds`) — cohérent avec le modèle Muscu (top-level) / PPG (groupe circuit).
 * Helper **additif** : ne touche pas `sessionKpis` ni la sérialisation.
 */
export function sessionTonnage(items: readonly ExerciseNode[] | undefined): SessionTonnage {
  let tonnageKg = 0;
  let repVolume = 0;
  const accumulate = (leaf: Exercise, rounds: number) => {
    if (leaf.type !== 'strength' && leaf.type !== 'core') return;
    const effectiveSets = leaf.sets ?? rounds;
    const reps = leaf.reps ?? 0;
    const volume = effectiveSets * reps;
    repVolume += volume;
    const kg = loadKg(leaf);
    if (kg != null) tonnageKg += volume * kg;
  };
  for (const node of items ?? []) {
    if (isExerciseGroup(node)) {
      const rounds = groupRounds(node.rounds);
      for (const leaf of node.items ?? []) accumulate(leaf, rounds);
    } else if (node != null) {
      accumulate(node, 1);
    }
  }
  return { tonnageKg: Math.round(tonnageKg), repVolume };
}

/** Tonnage lisible (« 4,2 t » au-delà de 1000 kg, sinon « 850 kg »), ou `undefined` si nul. */
export function formatTonnage(kg: number): string | undefined {
  if (kg <= 0) return undefined;
  if (kg >= 1000) {
    const t = kg / 1000;
    return `${Number.isInteger(t) ? t : t.toFixed(1).replace('.', ',')} t`;
  }
  return `${kg} kg`;
}
