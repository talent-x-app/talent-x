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
 * | bars (075, ADR-25) | vertical_jumps | grille barres × 3 essais (hauteur/perche) |
 * | checklist (v1) | strength, custom, core, warmup, cooldown | réalisé / non réalisé |
 */
export type EntryMode = 'time' | 'distance' | 'bars' | 'checklist';

/** Nombre d'essais par barre (règle d'athlétisme : 3 essais, élimination après 3 échecs). */
export const ATTEMPTS_PER_BAR = 3;

/** État d'une cellule d'essai de la grille de barres (non tenté / franchi / échoué). */
export type BarAttempt = 'none' | 'cleared' | 'failed';

/** Une barre de la grille : hauteur (m, saisie libre) + ses essais. */
export interface BarRow {
  height: string;
  attempts: BarAttempt[];
}

/**
 * État de saisie d'un exercice (champs numériques en chaînes, saisie libre). Le mode
 * `checklist` porte **un booléen par tour** (`done[k]` = tour k réalisé) : 1 seul tour
 * hors groupe (rétro-compat v1), N tours pour un membre de groupe (ADR-27, `rounds`).
 */
export type ExerciseEntry =
  | { mode: 'checklist'; done: boolean[] }
  | { mode: 'time'; times: string[] }
  | { mode: 'distance'; attempts: { distance: string; failed: boolean }[] }
  | { mode: 'bars'; bars: BarRow[] };

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
    case BlockType.vertical_jumps:
      return 'bars';
    default:
      return 'checklist';
  }
}

/** Param numérique du bloc (conteneur libre, lecture défensive — cf. ADR-18). */
function param(ex: Exercise, key: string): number | undefined {
  const v = (ex.params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * Nombre de lignes initial : pré-rempli depuis la cible du bloc (TLX-062/073). Pour un
 * membre de **groupe** (ADR-27), `rounds` prime : la dimension « tour/série » est portée
 * par le groupe (et `sets` est masqué côté constructeur), une ligne par tour.
 */
export function initialRowCount(ex: Exercise, rounds?: number): number {
  if (rounds != null && rounds > 0) return rounds;
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

/** Nombre de barres pré-remplies par défaut quand le coach fixe départ + montée (ADR-25). */
const DEFAULT_BAR_COUNT = 5;

/** Une barre vide (hauteur libre + essais non tentés). */
export function makeEmptyBar(height = ''): BarRow {
  return { height, attempts: Array<BarAttempt>(ATTEMPTS_PER_BAR).fill('none') };
}

/**
 * Grille de barres initiale (ADR-25) — pré-remplie depuis les params du coach
 * (`startHeightCm` + `incrementCm`, en cm → m). Sans barre de départ, une seule barre vide
 * que l'athlète renseigne. Calcul en cm entiers pour éviter le bruit flottant.
 */
export function initialBars(ex: Exercise): BarRow[] {
  const startCm = param(ex, 'startHeightCm');
  if (startCm == null) return [makeEmptyBar()];
  const incrementCm = param(ex, 'incrementCm') ?? 0;
  return Array.from({ length: DEFAULT_BAR_COUNT }, (_unused, i) =>
    makeEmptyBar(String((startCm + i * incrementCm) / 100)),
  );
}

/**
 * État de saisie vide d'un exercice, dimensionné sur sa cible. `rounds` (groupe parent,
 * ADR-27) prime sur la cible du bloc : une ligne / une coche par tour.
 */
export function makeEmptyEntry(ex: Exercise, rounds?: number): ExerciseEntry {
  const mode = entryModeFor(ex);
  if (mode === 'time') return { mode, times: Array(initialRowCount(ex, rounds)).fill('') };
  if (mode === 'distance') {
    return {
      mode,
      attempts: Array.from({ length: initialRowCount(ex, rounds) }, () => ({
        distance: '',
        failed: false,
      })),
    };
  }
  if (mode === 'bars') return { mode, bars: initialBars(ex) };
  return { mode: 'checklist', done: Array(Math.max(rounds ?? 1, 1)).fill(false) };
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
 * Sérialise des lignes en `SetResult[]` **en préservant la position** : une ligne vide
 * intercalée avant la dernière ligne remplie devient `{ set, completed: false }` — le tour
 * k reste le set k (ADR-27, mapping positionnel des tours d'un groupe). Les vides en queue
 * sont coupés ; aucune ligne remplie → repli v1 `[{ set: 1, completed: false }]`.
 */
function serializePositional<T>(
  rows: readonly T[],
  measure: (row: T, set: number) => SetResult | undefined,
): SetResult[] {
  const measured = rows.map((row, i) => measure(row, i + 1));
  let lastFilled = -1;
  measured.forEach((m, i) => {
    if (m) lastFilled = i;
  });
  if (lastFilled < 0) return [{ set: 1, completed: false }];
  const sets: SetResult[] = [];
  for (let i = 0; i <= lastFilled; i++) sets.push(measured[i] ?? { set: i + 1, completed: false });
  return sets;
}

/**
 * Sérialise l'état de saisie d'un exercice en `ExerciseResult` v2. Les lignes intercalées
 * vides sont préservées en position (tour sauté → `{ set, completed: false }`, ADR-27) ;
 * un exercice mesuré sans aucune mesure retombe sur `completed: false` (v1).
 */
export function entryToResult(ex: Exercise, entry: ExerciseEntry): ExerciseResult {
  const base = { exerciseName: ex.name, order: ex.order };
  if (entry.mode === 'time') {
    return {
      ...base,
      setResults: serializePositional(entry.times, (raw, set) => {
        const t = parseTimeInput(raw);
        return t != null ? { set, timeSeconds: t, completed: true } : undefined;
      }),
    };
  }
  if (entry.mode === 'distance') {
    return {
      ...base,
      setResults: serializePositional(entry.attempts, (a, set) => {
        if (a.failed) return { set, failed: true, completed: true };
        const d = parseDistanceInput(a.distance);
        return d != null ? { set, distanceMeters: d, completed: true } : undefined;
      }),
    };
  }
  if (entry.mode === 'bars') {
    // Grille de barres (ADR-25) : un set par essai tenté (`distanceMeters` = hauteur,
    // `failed` = barre non franchie). La hauteur est portée même par un échec → la grille
    // reste reconstructible ; la barre franchie = max non-`failed` (cf. bestMeasuresByEvent).
    const sets: SetResult[] = [];
    entry.bars.forEach((bar) => {
      const h = parseDistanceInput(bar.height);
      if (h == null) return;
      bar.attempts.forEach((a) => {
        if (a === 'cleared')
          sets.push({ set: sets.length + 1, distanceMeters: h, completed: true });
        else if (a === 'failed') {
          sets.push({ set: sets.length + 1, distanceMeters: h, failed: true, completed: true });
        }
      });
    });
    return { ...base, setResults: sets.length ? sets : [{ set: 1, completed: false }] };
  }
  // Checklist : un set par tour (`done[k]` = tour k réalisé). 1 tour hors groupe (v1).
  const done = entry.done.length ? entry.done : [false];
  return { ...base, setResults: done.map((d, i) => ({ set: i + 1, completed: d })) };
}

/** Au moins une mesure / coche — pilote le compteur « réalisés » de l'écran. */
export function entryIsCompleted(entry: ExerciseEntry): boolean {
  if (entry.mode === 'time') return entry.times.some((t) => parseTimeInput(t) != null);
  if (entry.mode === 'distance') {
    return entry.attempts.some((a) => a.failed || parseDistanceInput(a.distance) != null);
  }
  if (entry.mode === 'bars') {
    // Au moins un essai tenté sur une barre de hauteur valide.
    return entry.bars.some(
      (bar) => parseDistanceInput(bar.height) != null && bar.attempts.some((a) => a !== 'none'),
    );
  }
  return entry.done.some(Boolean);
}

/** Barre franchie (m) la plus haute d'une grille, ou `undefined` si aucune franchie. */
export function clearedBarHeight(
  entry: Extract<ExerciseEntry, { mode: 'bars' }>,
): number | undefined {
  let best: number | undefined;
  entry.bars.forEach((bar) => {
    const h = parseDistanceInput(bar.height);
    if (h != null && bar.attempts.includes('cleared') && (best == null || h > best)) best = h;
  });
  return best;
}

/**
 * Mesures v2 d'un exercice en libellé lisible — pour la revue coach (C-08) :
 * « 7.45 s · 7.62 s », « 1:15.3 · 1:16 », « 6.42 m · mordu ». `undefined` sans mesure (v1).
 *
 * Distinction sans connaître le type du bloc (ADR-25) : un essai `failed` **avec** hauteur est
 * une **barre non franchie** (grille de barres → « 1.85 m ✗ ») ; `failed` **sans** distance est
 * un essai **mordu** (saut/lancer horizontal).
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
    } else if (s.failed) parts.push(s.distanceMeters != null ? `${s.distanceMeters} m ✗` : 'mordu');
    else if (s.distanceMeters != null) parts.push(`${s.distanceMeters} m`);
  });
  return parts.length ? parts.join(' · ') : undefined;
}

/** Mesure d'épreuve en libellé (« 7.45 s », « 1:15.3 », « 6.42 m ») — records, ADR-20. */
export function formatRecordValue(value: number, unit: 's' | 'm'): string {
  if (unit === 'm') return `${value} m`;
  return value >= 60 ? formatTimeInput(value) : `${formatTimeInput(value)} s`;
}

/**
 * Réhydrate l'état de saisie depuis une perf existante (mise à jour, rétro-compat v1).
 * `rounds` (groupe parent, ADR-27) dimensionne l'état vide de repli. La réhydratation des
 * modes mesurés est **positionnelle** : un tour sauté (`{ completed: false }`) redevient une
 * ligne vide, préservant l'alignement tour↔ligne.
 */
export function entryFromResult(
  ex: Exercise,
  result: ExerciseResult | undefined,
  rounds?: number,
): ExerciseEntry {
  const empty = makeEmptyEntry(ex, rounds);
  const sets = result?.setResults ?? [];
  if (empty.mode === 'time') {
    if (!sets.some((s) => s.timeSeconds != null)) return empty;
    return {
      mode: 'time',
      times: sets.map((s) => (s.timeSeconds != null ? formatTimeInput(s.timeSeconds) : '')),
    };
  }
  if (empty.mode === 'distance') {
    if (!sets.some((s) => s.distanceMeters != null || s.failed)) return empty;
    return {
      mode: 'distance',
      attempts: sets.map((s) => ({
        distance: s.distanceMeters != null ? String(s.distanceMeters) : '',
        failed: !!s.failed,
      })),
    };
  }
  if (empty.mode === 'bars') {
    // Regroupe les essais par hauteur (ordre de 1ʳᵉ apparition = ordre des barres) ; chaque
    // set = un essai (`failed` → échoué, sinon franchi). Padde à ATTEMPTS_PER_BAR pour la grille.
    const rows: BarRow[] = [];
    const byHeight = new Map<number, BarRow>();
    sets.forEach((s) => {
      if (s.distanceMeters == null) return;
      let row = byHeight.get(s.distanceMeters);
      if (!row) {
        row = { height: String(s.distanceMeters), attempts: [] };
        byHeight.set(s.distanceMeters, row);
        rows.push(row);
      }
      row.attempts.push(s.failed ? 'failed' : 'cleared');
    });
    if (!rows.length) return empty;
    rows.forEach((row) => {
      while (row.attempts.length < ATTEMPTS_PER_BAR) row.attempts.push('none');
    });
    return { mode: 'bars', bars: rows };
  }
  // Checklist : un booléen par tour saisi, sinon l'état vide dimensionné sur `rounds`.
  return {
    mode: 'checklist',
    done: sets.length
      ? sets.map((s) => !!s.completed)
      : Array(Math.max(rounds ?? 1, 1)).fill(false),
  };
}
