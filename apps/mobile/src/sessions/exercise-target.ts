import { BlockType, LoadUnit, type Exercise } from '@talent-x/api-client';

/**
 * Dérivation de la **cible** d'un exercice (TLX-062, ADR-18 §« Cibles → pré-remplissage »).
 *
 * Les `params` typés posés par le coach dans le constructeur (TLX-054→061) sont la source des
 * cibles exploitables ; ce module les traduit en libellé lisible côté athlète (A-04) — ce que
 * les seuls champs de base (`sets`/`reps`/`durationSeconds`) ne permettaient pas. Le conteneur
 * `params` est libre au niveau du contrat : lecture **défensive** (param manquant → ignoré,
 * repli sur la base commune, jamais d'exception). Source de vérité unique, réutilisable coach
 * (liste de séance) et athlète (saisie de perf).
 */

/** Lecture défensive d'un param numérique (le conteneur `params` est libre, cf. ADR-18). */
function num(params: Exercise['params'], key: string): number | undefined {
  const v = (params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Lecture défensive d'un param texte court (ex. discipline, tempo « 3-1-1-0 »). */
function str(params: Exercise['params'], key: string): string | undefined {
  const v = (params as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** Allure en s/km → « m:ss » (ex. 300 → « 5:00 »). */
function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Suffixe d'unité de charge pour l'affichage compact d'une cible. */
const LOAD_UNIT_SUFFIX: Record<LoadUnit, string> = {
  [LoadUnit.kg]: 'kg',
  [LoadUnit.lb]: 'lb',
  [LoadUnit.percent_1rm]: '% 1RM',
  [LoadUnit.bodyweight]: 'PdC',
};

/** Charge lisible (ex. « 80 kg »), ou `undefined` si absente. */
function loadLabel(load: Exercise['load']): string | undefined {
  if (!load) return undefined;
  return `${load.value} ${LOAD_UNIT_SUFFIX[load.unit]}`;
}

/** Cible depuis la base commune v1 (séries × reps / durée + charge). Utilisée en repli. */
function baseTarget(ex: Exercise): string | undefined {
  const parts: string[] = [];
  if (ex.sets && ex.reps) parts.push(`${ex.sets} × ${ex.reps}`);
  else if (ex.sets && ex.durationSeconds) parts.push(`${ex.sets} × ${ex.durationSeconds}s`);
  else if (ex.durationSeconds) parts.push(`${ex.durationSeconds}s`);
  else if (ex.reps) parts.push(`${ex.reps} reps`);
  const load = loadLabel(ex.load);
  if (load) parts.push(load);
  return parts.length ? parts.join(' · ') : undefined;
}

/** Joint des fragments non vides par « · », ou `undefined` si tout est vide. */
function join(parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length ? kept.join(' · ') : undefined;
}

/**
 * Cible propre au `type` (params typés), ou `undefined` si non renseignée → repli sur la base.
 * Chaque discipline lit les clés posées par son éditeur (TLX-054→061).
 */
function typedTarget(ex: Exercise): string | undefined {
  const p = ex.params;
  switch (ex.type) {
    case BlockType.interval: {
      const reps = num(p, 'reps');
      const work = num(p, 'workSeconds');
      const head =
        reps != null && work != null ? `${reps} × ${work}s` : work != null ? `${work}s` : undefined;
      const pct = num(p, 'percentVma');
      const rec = num(p, 'recoverySeconds');
      return join([
        head,
        pct != null ? `${pct} % VMA` : undefined,
        rec != null ? `récup ${rec}s` : undefined,
      ]);
    }
    case BlockType.sprint: {
      const reps = num(p, 'reps');
      const dist = num(p, 'distanceMeters');
      const head =
        reps != null && dist != null ? `${reps} × ${dist}m` : dist != null ? `${dist}m` : undefined;
      const pct = num(p, 'percentVma');
      const rec = num(p, 'recoverySeconds');
      return join([
        head,
        pct != null ? `${pct} % VMA` : undefined,
        rec != null ? `récup ${rec}s` : undefined,
      ]);
    }
    case BlockType.endurance: {
      const dist = num(p, 'distanceMeters');
      const pace = num(p, 'paceSecondsPerKm');
      const elev = num(p, 'elevationMeters');
      return join([
        dist != null ? `${dist}m` : undefined,
        pace != null ? `${formatPace(pace)}/km` : undefined,
        elev != null ? `D+${elev}m` : undefined,
      ]);
    }
    case BlockType.hurdles: {
      const height = num(p, 'heightCm');
      const spacing = num(p, 'spacingMeters');
      const rhythm = num(p, 'rhythmSteps');
      return join([
        height != null ? `h ${height}cm` : undefined,
        spacing != null ? `esp. ${spacing}m` : undefined,
        rhythm != null ? `rythme ${rhythm}` : undefined,
      ]);
    }
    case BlockType.jumps: {
      const approach = num(p, 'approachMeters');
      const full = num(p, 'fullJumps');
      const plyo = num(p, 'plyoContacts');
      return join([
        approach != null ? `élan ${approach}m` : undefined,
        full != null ? `${full} complets` : undefined,
        plyo != null ? `${plyo} contacts` : undefined,
      ]);
    }
    case BlockType.vertical_jumps: {
      // Saut vertical (ADR-25) : discipline + barre de départ (cm → m) + montée (cm).
      const discipline = str(p, 'discipline');
      const start = num(p, 'startHeightCm');
      const increment = num(p, 'incrementCm');
      return join([
        discipline === 'pole' ? 'Perche' : discipline === 'high' ? 'Hauteur' : undefined,
        start != null ? `départ ${start / 100} m` : undefined,
        increment != null ? `+${increment} cm` : undefined,
      ]);
    }
    case BlockType.throws: {
      const kg = num(p, 'implementKg');
      const tech = num(p, 'techniqueThrows');
      const full = num(p, 'fullThrows');
      const counts =
        tech != null && full != null
          ? `${tech} tech + ${full} complets`
          : tech != null
            ? `${tech} tech`
            : full != null
              ? `${full} complets`
              : undefined;
      return join([kg != null ? `${kg} kg` : undefined, counts]);
    }
    case BlockType.core:
    case BlockType.warmup:
    case BlockType.cooldown: {
      const rounds = num(p, 'rounds');
      const station = num(p, 'stationSeconds');
      const head =
        rounds != null && station != null
          ? `${rounds} tours × ${station}s`
          : rounds != null
            ? `${rounds} tours`
            : station != null
              ? `${station}s`
              : undefined;
      return head;
    }
    case BlockType.strength: {
      // ADR-28 (règle 6) : le tempo d'exécution s'ajoute à la base v1 (séries × reps × charge).
      const tempo = str(p, 'tempo');
      return tempo != null ? join([baseTarget(ex), `tempo ${tempo}`]) : undefined;
    }
    default:
      // `custom` / type absent : base commune v1 (séries × reps × charge).
      return undefined;
  }
}

/**
 * Cible lisible d'un exercice : params typés (TLX-054→061) si renseignés, sinon repli sur la
 * base commune v1, sinon « — ». Tolérant aux blocs incomplets (la saisie coach est libre).
 */
export function formatExerciseTarget(ex: Exercise): string {
  return typedTarget(ex) ?? baseTarget(ex) ?? '—';
}
