import {
  BlockType,
  type Exercise,
  type ExerciseResult,
  type SetResult,
} from '@talent-x/api-client';

/**
 * Saisie de perf typée (A-04 §4 — TLX-072/073/074, ADR-19). Le **mode de saisie** dérive du
 * `type` du bloc de séance (contrat exercises v2, ADR-18) ; les mesures sont sérialisées en
 * `results` **v2** (`timeSeconds`/`distanceMeters`/`failed` sur `SetResult`), rétro-compatible.
 *
 * | Mode | BlockType | Saisie |
 * |------|-----------|--------|
 * | time (072/073) | sprint, hurdles, endurance, interval | temps décimal par course/répétition |
 * | distance (074) | jumps, throws | distance par essai + essai mordu |
 * | checklist (v1) | strength, custom, core, warmup, cooldown | réalisé / non réalisé |
 */
export type EntryMode = 'time' | 'distance' | 'checklist';

/** État de saisie d'un exercice (champs numériques en chaînes, saisie libre). */
export type ExerciseEntry =
  | { mode: 'checklist'; done: boolean }
  | { mode: 'time'; times: string[] }
  | { mode: 'distance'; attempts: { distance: string; failed: boolean }[] };

/** Mode de saisie d'un bloc — dérivé de son `type` (défaut checklist v1). */
export function entryModeFor(ex: Pick<Exercise, 'type'>): EntryMode {
  switch (ex.type) {
    case BlockType.sprint:
    case BlockType.hurdles:
    case BlockType.endurance:
    case BlockType.interval:
      return 'time';
    case BlockType.jumps:
    case BlockType.throws:
      return 'distance';
    default:
      return 'checklist';
  }
}

/** Param numérique du bloc (conteneur libre, lecture défensive — cf. ADR-18). */
function param(ex: Exercise, key: string): number | undefined {
  const v = (ex.params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Nombre de lignes initial : pré-rempli depuis la cible du bloc (TLX-062/073). */
export function initialRowCount(ex: Exercise): number {
  const mode = entryModeFor(ex);
  if (mode === 'time') {
    // interval/sprint : nombre de répétitions ciblé ; sinon séries v1 ; sinon 1 course.
    return param(ex, 'reps') ?? ex.sets ?? 1;
  }
  if (mode === 'distance') {
    // sauts : sauts complets ciblés ; lancers : lancers complets ; sinon 3 essais.
    return param(ex, 'fullJumps') ?? param(ex, 'fullThrows') ?? 3;
  }
  return 1;
}

/** État de saisie vide d'un exercice, dimensionné sur sa cible. */
export function makeEmptyEntry(ex: Exercise): ExerciseEntry {
  const mode = entryModeFor(ex);
  if (mode === 'time') return { mode, times: Array(initialRowCount(ex)).fill('') };
  if (mode === 'distance') {
    return {
      mode,
      attempts: Array.from({ length: initialRowCount(ex) }, () => ({
        distance: '',
        failed: false,
      })),
    };
  }
  return { mode: 'checklist', done: false };
}

/**
 * Temps saisi → secondes décimales. Accepte « 7.45 » / « 7,45 » (secondes) et « 1:15.3 »
 * (min:sec, demi-fond). `undefined` si vide/invalide.
 */
export function parseTimeInput(raw: string): number | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  if (trimmed.includes(':')) {
    const [minPart, secPart] = trimmed.split(':');
    const min = Number(minPart);
    const sec = Number(secPart);
    if (!Number.isInteger(min) || min < 0 || !Number.isFinite(sec) || sec < 0 || sec >= 60) {
      return undefined;
    }
    return min * 60 + sec;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Secondes → affichage de saisie (« 7.45 », « 1:15.3 » au-delà de la minute). */
export function formatTimeInput(seconds: number): string {
  if (seconds >= 60) {
    const min = Math.floor(seconds / 60);
    const sec = Math.round((seconds - min * 60) * 100) / 100;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  }
  return String(Math.round(seconds * 100) / 100);
}

/** Distance saisie (m, décimale) → nombre, ou `undefined` si vide/invalide. */
export function parseDistanceInput(raw: string): number | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Sérialise l'état de saisie d'un exercice en `ExerciseResult` v2. Les lignes vides sont
 * ignorées ; un exercice mesuré sans aucune mesure retombe sur `completed: false` (v1).
 */
export function entryToResult(ex: Exercise, entry: ExerciseEntry): ExerciseResult {
  const base = { exerciseName: ex.name, order: ex.order };
  if (entry.mode === 'time') {
    const sets: SetResult[] = [];
    entry.times.forEach((raw) => {
      const t = parseTimeInput(raw);
      if (t != null) sets.push({ set: sets.length + 1, timeSeconds: t, completed: true });
    });
    return { ...base, setResults: sets.length ? sets : [{ set: 1, completed: false }] };
  }
  if (entry.mode === 'distance') {
    const sets: SetResult[] = [];
    entry.attempts.forEach((a) => {
      const d = parseDistanceInput(a.distance);
      if (a.failed) sets.push({ set: sets.length + 1, failed: true, completed: true });
      else if (d != null) {
        sets.push({ set: sets.length + 1, distanceMeters: d, completed: true });
      }
    });
    return { ...base, setResults: sets.length ? sets : [{ set: 1, completed: false }] };
  }
  return { ...base, setResults: [{ set: 1, completed: entry.done }] };
}

/** Au moins une mesure / coche — pilote le compteur « réalisés » de l'écran. */
export function entryIsCompleted(entry: ExerciseEntry): boolean {
  if (entry.mode === 'time') return entry.times.some((t) => parseTimeInput(t) != null);
  if (entry.mode === 'distance') {
    return entry.attempts.some((a) => a.failed || parseDistanceInput(a.distance) != null);
  }
  return entry.done;
}

/**
 * Mesures v2 d'un exercice en libellé lisible — pour la revue coach (C-08) :
 * « 7.45 s · 7.62 s », « 1:15.3 · 1:16 », « 6.42 m · mordu ». `undefined` sans mesure (v1).
 */
export function formatMeasures(sets: SetResult[] | undefined): string | undefined {
  if (!sets?.length) return undefined;
  const parts: string[] = [];
  sets.forEach((s) => {
    if (s.timeSeconds != null) {
      parts.push(
        s.timeSeconds >= 60
          ? formatTimeInput(s.timeSeconds)
          : `${formatTimeInput(s.timeSeconds)} s`,
      );
    } else if (s.failed) parts.push('mordu');
    else if (s.distanceMeters != null) parts.push(`${s.distanceMeters} m`);
  });
  return parts.length ? parts.join(' · ') : undefined;
}

/** Réhydrate l'état de saisie depuis une perf existante (mise à jour, rétro-compat v1). */
export function entryFromResult(ex: Exercise, result: ExerciseResult | undefined): ExerciseEntry {
  const empty = makeEmptyEntry(ex);
  const sets = result?.setResults ?? [];
  if (empty.mode === 'time') {
    const times = sets
      .filter((s) => s.timeSeconds != null)
      .map((s) => formatTimeInput(s.timeSeconds as number));
    return times.length ? { mode: 'time', times } : empty;
  }
  if (empty.mode === 'distance') {
    const attempts = sets
      .filter((s) => s.distanceMeters != null || s.failed)
      .map((s) => ({
        distance: s.distanceMeters != null ? String(s.distanceMeters) : '',
        failed: !!s.failed,
      }));
    return attempts.length ? { mode: 'distance', attempts } : empty;
  }
  return { mode: 'checklist', done: sets.some((s) => s.completed) };
}
