import { BlockType, LoadUnit } from '@talent-x/api-client';
import {
  makeBlock,
  makeCooldownBlock,
  makeSeriesGroup,
  makeWarmupBlock,
  type EditableBlock,
  type EditableNode,
} from './session-builder-ui';
import { type SessionBuilderPreset } from './SessionBuilderScreen';
import { disciplineConfig, type DisciplineKey } from './discipline-assistants';

/**
 * Presets et amorces des **assistants de création par discipline** (ADR-38, TLX-155→159).
 * Chaque preset produit un canvas `EditableNode[]` — typiquement une ou plusieurs **séries**
 * (`groupType:"series"`, ADR-27) de feuilles typées — réutilisé tel quel par le constructeur
 * générique (la séance reste éditable en C-05 sans perte). Les valeurs de `params` sont en
 * **chaînes** (saisie brute du constructeur) ; `nodesToItems` les normalise à l'envoi.
 */

/** Effort sprint d'une série : distance + intensité (% record) + récup r + type de départ. */
function sprintEffort(
  distanceMeters: number,
  intensityValue: number,
  recoverySeconds: number,
  opts: { startType: string; flyingZone?: boolean } = { startType: 'blocks' },
): EditableBlock {
  return makeBlock({
    type: BlockType.sprint,
    name: `${distanceMeters} m`,
    params: {
      reps: '1',
      distanceMeters: String(distanceMeters),
      recoverySeconds: String(recoverySeconds),
      intensityMode: 'percent_record',
      intensityValue: String(intensityValue),
      startType: opts.startType,
      ...(opts.flyingZone ? { flyingZone: 'true' } : {}),
    },
  });
}

/** Une série de sprints (rounds = nb de séries, R = récup inter-séries). */
function sprintSeries(
  name: string,
  rounds: number,
  restBetweenRoundsSeconds: number,
  items: EditableBlock[],
): EditableNode {
  return makeSeriesGroup({
    name,
    rounds: String(rounds),
    restBetweenRoundsSeconds: String(restBetweenRoundsSeconds),
    items,
  });
}

/** Presets Sprint repris de la maquette (ADR-38, TLX-155). Exporté pour le canvas Sprint (ADR-39). */
export const SPRINT_PRESETS: SessionBuilderPreset[] = [
  {
    key: 'starts',
    label: 'Départs / Accélération',
    build: () => [
      sprintSeries('Départs', 3, 300, [
        sprintEffort(20, 95, 180, { startType: 'blocks' }),
        sprintEffort(30, 95, 180, { startType: 'blocks' }),
        sprintEffort(40, 95, 240, { startType: 'blocks' }),
      ]),
    ],
  },
  {
    key: 'max_velocity',
    label: 'Vitesse max',
    build: () => [
      sprintSeries('Vitesse max', 2, 600, [
        sprintEffort(60, 100, 360, { startType: 'flying', flyingZone: true }),
        sprintEffort(60, 100, 360, { startType: 'flying', flyingZone: true }),
      ]),
    ],
  },
  {
    key: 'speed_endurance',
    label: 'Endurance de vitesse',
    build: () => [
      sprintSeries('Endurance de vitesse', 1, 0, [
        sprintEffort(120, 90, 360, { startType: 'standing' }),
        sprintEffort(150, 90, 420, { startType: 'standing' }),
        sprintEffort(120, 90, 360, { startType: 'standing' }),
      ]),
    ],
  },
  {
    key: 'lactic',
    label: 'Résistance / lactique',
    build: () => [
      sprintSeries('Résistance lactique', 1, 0, [
        sprintEffort(300, 90, 600, { startType: 'standing' }),
        sprintEffort(300, 90, 600, { startType: 'standing' }),
      ]),
    ],
  },
];

// --- Tables de records (fictifs, ADR-40) -----------------------------------------------------

/**
 * Records fictifs (mêmes esprit/usage que les `PRESETS` des prototypes : permettent de calculer
 * une **valeur cible réelle** — temps pour haies/sprint, distance pour sauts/lancers — à partir
 * d'un % du record. Valeurs plausibles mais non officielles, à affiner si besoin (TLX-168).
 */
export const HURDLE_RECORDS: Record<string, number> = {
  '110mH-H': 13.8,
  '100mH-F': 13.0,
  '60mH-H': 7.7,
  '60mH-F': 8.1,
  '400mH-H': 50.0,
  '400mH-F': 56.0,
};

/** Records fictifs de sauts horizontaux/verticaux (mètres), référence unique par discipline. */
export const JUMP_RECORDS: Record<string, number> = {
  long: 8.95,
  triple: 18.29,
  high: 2.45,
  pole: 6.23,
};

/** Records fictifs de lancers (mètres), référence unique par discipline. */
export const THROW_RECORDS: Record<string, number> = {
  shot: 23.12,
  discus: 74.08,
  javelin: 98.48,
  hammer: 86.74,
};

/** Clé de référentiel haies : `${event}-${sex}` (ex. `110mH-H`). */
export function hurdleRecordKey(event: string, sex: 'H' | 'F'): string {
  return `${event}-${sex}`;
}

/** Valeur cible (temps, s) = record × 100 ⁄ %record. `undefined` si référentiel inconnu. */
export function targetTimeFromRecord(
  event: string,
  sex: 'H' | 'F',
  percent: number,
): number | undefined {
  const ref = HURDLE_RECORDS[hurdleRecordKey(event, sex)];
  if (ref == null || percent <= 0) return undefined;
  return Math.round((ref * 100) / percent / 0.01) * 0.01;
}

/** Valeur cible (distance, m) = record × %record ⁄ 100. `undefined` si discipline inconnue. */
export function targetDistanceFromRecord(
  records: Record<string, number>,
  discipline: string,
  percent: number,
): number | undefined {
  const ref = records[discipline];
  if (ref == null) return undefined;
  return Math.round(ref * (percent / 100) * 100) / 100;
}

// --- Haies (TLX-156) -------------------------------------------------------------------------

/**
 * Distance de course d'une épreuve de haies = élan jusqu'à la 1re haie + (n−1) intervalles +
 * dégagement vers l'arrivée. Permet de dériver `distanceMeters` (suivi de progression, TLX-91)
 * des paramètres techniques (ex. 110 mH : 13,72 + 9×9,14 + 14,02 = 110). Arrondi au cm.
 */
export function hurdleRaceDistance(
  approachMeters: number,
  spacingMeters: number,
  hurdleCount: number,
  runInMeters: number,
): number {
  const between = hurdleCount > 1 ? spacingMeters * (hurdleCount - 1) : 0;
  return Math.round((approachMeters + between + runInMeters) * 100) / 100;
}

/** Passage de haies typé, distance de course dérivée des paramètres techniques. */
function hurdleEffort(opts: {
  event: string;
  heightCm: number;
  spacingMeters: number;
  hurdleCount: number;
  approachMeters: number;
  runInMeters: number;
  rhythmSteps: number;
  recoverySeconds: number;
  leadLeg?: string;
  sex?: 'H' | 'F';
}): EditableBlock {
  return makeBlock({
    type: BlockType.hurdles,
    name: opts.event,
    params: {
      event: opts.event,
      distanceMeters: String(
        hurdleRaceDistance(
          opts.approachMeters,
          opts.spacingMeters,
          opts.hurdleCount,
          opts.runInMeters,
        ),
      ),
      heightCm: String(opts.heightCm),
      spacingMeters: String(opts.spacingMeters),
      spacingMode: 'regulation',
      hurdleCount: String(opts.hurdleCount),
      approachMeters: String(opts.approachMeters),
      rhythmSteps: String(opts.rhythmSteps),
      leadLeg: opts.leadLeg ?? 'left',
      startType: 'blocks',
      sex: opts.sex ?? 'H',
      recoverySeconds: String(opts.recoverySeconds),
    },
  });
}

export const HURDLES_PRESETS: SessionBuilderPreset[] = [
  {
    key: 'h110',
    label: '110 m haies (H)',
    build: () => [
      makeSeriesGroup({
        name: '110 m haies — départs',
        rounds: '4',
        restBetweenRoundsSeconds: '300',
        items: [
          hurdleEffort({
            event: '110mH',
            heightCm: 106.7,
            spacingMeters: 9.14,
            hurdleCount: 10,
            approachMeters: 13.72,
            runInMeters: 14.02,
            rhythmSteps: 3,
            recoverySeconds: 300,
          }),
        ],
      }),
    ],
  },
  {
    key: 'h100',
    label: '100 m haies (F)',
    build: () => [
      makeSeriesGroup({
        name: '100 m haies — départs',
        rounds: '4',
        restBetweenRoundsSeconds: '300',
        items: [
          hurdleEffort({
            event: '100mH',
            heightCm: 84,
            spacingMeters: 8.5,
            hurdleCount: 10,
            approachMeters: 13,
            runInMeters: 10.5,
            rhythmSteps: 3,
            recoverySeconds: 300,
            sex: 'F',
          }),
        ],
      }),
    ],
  },
  {
    key: 'h400',
    label: '400 m haies',
    build: () => [
      makeSeriesGroup({
        name: '400 m haies — rythme',
        rounds: '3',
        restBetweenRoundsSeconds: '600',
        items: [
          hurdleEffort({
            event: '400mH',
            heightCm: 91.4,
            spacingMeters: 35,
            hurdleCount: 10,
            approachMeters: 45,
            runInMeters: 40,
            rhythmSteps: 15,
            recoverySeconds: 420,
            leadLeg: 'alt',
          }),
        ],
      }),
    ],
  },
];

// --- Demi-fond / Endurance (TLX-157) ---------------------------------------------------------

/**
 * Effort d'endurance. `unit: "duration"` (durée d'effort) → `type:"interval"` ; `unit:
 * "distance"` → `type:"endurance"` (ADR-38). `distanceMeters` est toujours posé (suivi TLX-91,
 * requis par les deux types dans le constructeur).
 */
function enduranceEffort(opts: {
  unit: 'distance' | 'duration';
  name: string;
  distanceMeters: number;
  workSeconds?: number;
  recoverySeconds: number;
  recoveryType?: string;
  percentVma?: number;
  paceSecondsPerKm?: number;
}): EditableBlock {
  const params: Record<string, string> = {
    distanceMeters: String(opts.distanceMeters),
    recoverySeconds: String(opts.recoverySeconds),
  };
  if (opts.workSeconds != null) params.workSeconds = String(opts.workSeconds);
  if (opts.recoveryType) params.recoveryType = opts.recoveryType;
  if (opts.percentVma != null) params.percentVma = String(opts.percentVma);
  if (opts.paceSecondsPerKm != null) params.paceSecondsPerKm = String(opts.paceSecondsPerKm);
  return makeBlock({
    type: opts.unit === 'duration' ? BlockType.interval : BlockType.endurance,
    name: opts.name,
    params,
  });
}

export const ENDURANCE_PRESETS: SessionBuilderPreset[] = [
  {
    key: 'fundamental',
    label: 'Endurance fondamentale',
    build: () => [
      makeSeriesGroup({
        name: 'Footing',
        rounds: '1',
        items: [
          enduranceEffort({
            unit: 'distance',
            name: 'Footing continu',
            distanceMeters: 8000,
            recoverySeconds: 0,
            paceSecondsPerKm: 330,
            percentVma: 65,
          }),
        ],
      }),
    ],
  },
  {
    key: 'threshold',
    label: 'Seuil / Tempo',
    build: () => [
      makeSeriesGroup({
        name: 'Seuil',
        rounds: '3',
        restBetweenRoundsSeconds: '120',
        items: [
          enduranceEffort({
            unit: 'distance',
            name: '2000 m au seuil',
            distanceMeters: 2000,
            recoverySeconds: 120,
            recoveryType: 'active',
            percentVma: 85,
          }),
        ],
      }),
    ],
  },
  {
    key: 'vma_short',
    label: 'VMA courte 30/30',
    build: () => [
      makeSeriesGroup({
        name: 'VMA 30/30',
        rounds: '10',
        restBetweenRoundsSeconds: '0',
        items: [
          enduranceEffort({
            unit: 'duration',
            name: '30 s VMA',
            distanceMeters: 150,
            workSeconds: 30,
            recoverySeconds: 30,
            recoveryType: 'active',
            percentVma: 100,
          }),
        ],
      }),
    ],
  },
  {
    key: 'vma_long',
    label: 'VMA longue',
    build: () => [
      makeSeriesGroup({
        name: 'VMA longue',
        rounds: '5',
        restBetweenRoundsSeconds: '90',
        items: [
          enduranceEffort({
            unit: 'duration',
            name: '3 min VMA',
            distanceMeters: 800,
            workSeconds: 180,
            recoverySeconds: 90,
            recoveryType: 'active',
            percentVma: 95,
          }),
        ],
      }),
    ],
  },
  {
    key: 'long_run',
    label: 'Sortie longue',
    build: () => [
      makeSeriesGroup({
        name: 'Sortie longue',
        rounds: '1',
        items: [
          enduranceEffort({
            unit: 'distance',
            name: 'Sortie longue',
            distanceMeters: 15000,
            recoverySeconds: 0,
            paceSecondsPerKm: 300,
            percentVma: 70,
          }),
        ],
      }),
    ],
  },
];

// --- Sauts (TLX-158) -------------------------------------------------------------------------

/** Saut horizontal (longueur/triple) → `type:"jumps"`. */
function horizontalJump(opts: {
  discipline: 'long' | 'triple';
  name: string;
  approach: number;
  approachUnit: string;
  attempts: number;
  recoverySeconds: number;
}): EditableBlock {
  return makeBlock({
    type: BlockType.jumps,
    name: opts.name,
    params: {
      discipline: opts.discipline,
      approach: String(opts.approach),
      approachUnit: opts.approachUnit,
      attempts: String(opts.attempts),
      takeoff: 'board',
      recoverySeconds: String(opts.recoverySeconds),
    },
  });
}

/** Saut vertical (hauteur/perche) → `type:"vertical_jumps"` (pré-remplit la grille de barres, ADR-25). */
function verticalJump(opts: {
  discipline: 'high' | 'pole';
  name: string;
  startHeightCm: number;
  incrementCm: number;
  bars: number;
  attemptsPerBar: number;
  gripCm?: number;
}): EditableBlock {
  const params: Record<string, string> = {
    discipline: opts.discipline,
    startHeightCm: String(opts.startHeightCm),
    incrementCm: String(opts.incrementCm),
    bars: String(opts.bars),
    attemptsPerBar: String(opts.attemptsPerBar),
  };
  if (opts.gripCm != null) params.gripCm = String(opts.gripCm);
  return makeBlock({ type: BlockType.vertical_jumps, name: opts.name, params });
}

export const JUMPS_PRESETS: SessionBuilderPreset[] = [
  {
    key: 'long_full',
    label: 'Longueur — élan complet',
    build: () => [
      makeSeriesGroup({
        name: 'Longueur — élan complet',
        rounds: '6',
        restBetweenRoundsSeconds: '240',
        items: [
          horizontalJump({
            discipline: 'long',
            name: 'Saut en longueur',
            approach: 18,
            approachUnit: 'steps',
            attempts: 1,
            recoverySeconds: 240,
          }),
        ],
      }),
    ],
  },
  {
    key: 'long_short',
    label: 'Longueur — élan réduit',
    build: () => [
      makeSeriesGroup({
        name: 'Longueur — élan réduit',
        rounds: '8',
        restBetweenRoundsSeconds: '120',
        items: [
          horizontalJump({
            discipline: 'long',
            name: 'Saut élan réduit',
            approach: 8,
            approachUnit: 'steps',
            attempts: 1,
            recoverySeconds: 120,
          }),
        ],
      }),
    ],
  },
  {
    key: 'triple',
    label: 'Triple saut',
    build: () => [
      makeSeriesGroup({
        name: 'Triple saut',
        rounds: '5',
        restBetweenRoundsSeconds: '300',
        items: [
          horizontalJump({
            discipline: 'triple',
            name: 'Triple saut',
            approach: 16,
            approachUnit: 'steps',
            attempts: 1,
            recoverySeconds: 300,
          }),
        ],
      }),
    ],
  },
  {
    key: 'high',
    label: 'Hauteur',
    build: () => [
      makeSeriesGroup({
        name: 'Saut en hauteur',
        rounds: '1',
        items: [
          verticalJump({
            discipline: 'high',
            name: 'Hauteur',
            startHeightCm: 165,
            incrementCm: 5,
            bars: 6,
            attemptsPerBar: 3,
          }),
        ],
      }),
    ],
  },
  {
    key: 'pole',
    label: 'Perche',
    build: () => [
      makeSeriesGroup({
        name: 'Saut à la perche',
        rounds: '1',
        items: [
          verticalJump({
            discipline: 'pole',
            name: 'Perche',
            startHeightCm: 360,
            incrementCm: 15,
            bars: 6,
            attemptsPerBar: 3,
            gripCm: 430,
          }),
        ],
      }),
    ],
  },
];

// --- Lancers (TLX-159) -----------------------------------------------------------------------

/** Masses réglementaires (kg) par discipline et catégorie (sexe). */
const REGULATION_IMPLEMENT_KG: Record<string, { M: number; F: number }> = {
  shot: { M: 7.26, F: 4 },
  discus: { M: 2, F: 1 },
  javelin: { M: 0.8, F: 0.6 },
  hammer: { M: 7.26, F: 4 },
};

/** Poids d'engin réglementaire dérivé de la discipline + catégorie, ou `undefined` si inconnue. */
export function regulationImplementKg(discipline: string, sex: 'M' | 'F'): number | undefined {
  return REGULATION_IMPLEMENT_KG[discipline]?.[sex];
}

/** Atelier de lancers typé, poids d'engin dérivé de discipline + catégorie. */
function throwEffort(opts: {
  discipline: string;
  sex: 'M' | 'F';
  name: string;
  techniqueThrows?: number;
  fullThrows?: number;
  implementState?: string;
  style?: string;
  targetPercent?: number;
}): EditableBlock {
  const params: Record<string, string> = {
    discipline: opts.discipline,
    sex: opts.sex,
    implementState: opts.implementState ?? 'regulation',
    targetMode: 'percent_record',
  };
  const kg = regulationImplementKg(opts.discipline, opts.sex);
  if (kg != null) params.implementKg = String(kg);
  if (opts.techniqueThrows != null) params.techniqueThrows = String(opts.techniqueThrows);
  if (opts.fullThrows != null) params.fullThrows = String(opts.fullThrows);
  if (opts.style) params.style = opts.style;
  if (opts.targetPercent != null) params.targetPercent = String(opts.targetPercent);
  return makeBlock({ type: BlockType.throws, name: opts.name, params });
}

/** Presets Lancers réalignés sur les prototypes (ADR-40, TLX-168). */
export const THROWS_PRESETS: SessionBuilderPreset[] = [
  {
    key: 'shot_technique',
    label: 'Poids — technique',
    build: () => [
      makeSeriesGroup({
        name: 'Poids — technique',
        rounds: '1',
        items: [
          throwEffort({
            discipline: 'shot',
            sex: 'M',
            name: 'Poids technique',
            techniqueThrows: 12,
            fullThrows: 4,
            style: 'spin',
            targetPercent: 90,
          }),
        ],
      }),
    ],
  },
  {
    key: 'shot_full',
    label: 'Poids — jets pleins',
    build: () => [
      makeSeriesGroup({
        name: 'Poids — jets pleins',
        rounds: '1',
        items: [
          throwEffort({
            discipline: 'shot',
            sex: 'M',
            name: 'Poids jets pleins',
            techniqueThrows: 4,
            fullThrows: 10,
            style: 'spin',
            targetPercent: 95,
          }),
        ],
      }),
    ],
  },
  {
    key: 'discus_comp',
    label: 'Disque — compétition',
    build: () => [
      makeSeriesGroup({
        name: 'Disque — simulation compétition',
        rounds: '1',
        items: [
          throwEffort({
            discipline: 'discus',
            sex: 'M',
            name: 'Disque compétition',
            techniqueThrows: 2,
            fullThrows: 6,
            targetPercent: 100,
          }),
        ],
      }),
    ],
  },
  {
    key: 'shot_heavy',
    label: 'Poids — engin lourd',
    build: () => [
      makeSeriesGroup({
        name: 'Poids — engin lourd',
        rounds: '1',
        items: [
          throwEffort({
            discipline: 'shot',
            sex: 'M',
            name: 'Poids lourd',
            implementState: 'heavy',
            techniqueThrows: 6,
            fullThrows: 8,
            style: 'glide',
            targetPercent: 85,
          }),
        ],
      }),
    ],
  },
  {
    key: 'shot_light',
    label: 'Poids — engin léger',
    build: () => [
      makeSeriesGroup({
        name: 'Poids — engin léger',
        rounds: '1',
        items: [
          throwEffort({
            discipline: 'shot',
            sex: 'M',
            name: 'Poids léger',
            implementState: 'light',
            techniqueThrows: 4,
            fullThrows: 10,
            style: 'spin',
            targetPercent: 100,
          }),
        ],
      }),
    ],
  },
];

// --- Renforcement / PPG (TLX-172, ADR-41) ----------------------------------------------------

/**
 * 1RM de référence (kg, **fictifs** — même esprit que `HURDLE_RECORDS`/`JUMP_RECORDS`, ADR-41 §4).
 * Sert à dériver une **charge cible** (`≈ <kg>`) en mode `% 1RM`, côté carte. Référence générique
 * tant que l'individualisation par athlète n'est pas livrée (différée, cohérent ADR-20).
 */
export const ONE_RM_REFERENCE: Record<string, number> = {
  // Haltérophilie / mouvements rapides
  clean: 90,
  power_clean: 85,
  snatch: 70,
  high_pull: 75,
  push_press: 80,
  // Bas du corps / squats
  squat: 140,
  front_squat: 110,
  split_squat: 70,
  lunge: 80,
  step_up: 60,
  // Chaîne postérieure
  deadlift: 160,
  romanian_deadlift: 130,
  good_morning: 70,
  hipthrust: 150,
  // Haut du corps
  bench: 100,
  incline_bench: 85,
  ohp: 60,
  row: 80,
  pullup: 90,
};

/**
 * Libellés FR des exercices de musculation (clé `params.exerciseKey` ↔ libellé `name`).
 * Set « starter » (~28). Les mouvements barre/compound ont un 1RM dans `ONE_RM_REFERENCE` ;
 * les exercices au poids de corps / pliométrie / gainage / medecine-ball n'ont **qu'un libellé**
 * (pas d'entrée 1RM → `targetLoadFromOneRm` renvoie `undefined`, la cible %1RM ne s'affiche pas).
 */
export const EXERCISE_LABELS: Record<string, string> = {
  // Haltérophilie
  clean: 'Épaulé',
  power_clean: 'Épaulé puissance',
  snatch: 'Arraché',
  high_pull: 'Tirage haltéro',
  push_press: 'Développé jeté',
  // Bas du corps
  squat: 'Squat',
  front_squat: 'Squat avant',
  split_squat: 'Fentes bulgares',
  lunge: 'Fentes',
  step_up: 'Montée sur banc',
  // Chaîne postérieure
  deadlift: 'Soulevé de terre',
  romanian_deadlift: 'Soulevé de terre roumain',
  good_morning: 'Good morning',
  hipthrust: 'Hip thrust',
  nordic_curl: 'Nordic (ischios)',
  glute_bridge: 'Pont fessier',
  calf_raise: 'Mollets',
  // Haut du corps
  bench: 'Développé couché',
  incline_bench: 'Développé incliné',
  ohp: 'Développé militaire',
  row: 'Tirage',
  pullup: 'Tractions lestées',
  // Gainage / core
  plank: 'Gainage',
  side_plank: 'Gainage latéral',
  hollow_hold: 'Hollow hold',
  leg_raise: 'Relevé de jambes',
  pallof_press: 'Pallof press',
  // Pliométrie / medecine-ball
  box_jump: 'Saut sur banc',
  squat_jump: 'Squat sauté',
  drop_jump: 'Saut en contrebas',
  bounds: 'Foulées bondissantes',
  medball_chest: 'Lancer medecine-ball (poitrine)',
  medball_overhead: 'Lancer medecine-ball (au-dessus)',
  mountain_climbers: 'Mountain climbers',
};

/**
 * Regroupement ordonné des exercices pour un sélecteur catégorisé (optionnel, additif).
 * Couvre toutes les clés de `EXERCISE_LABELS`. Le picker plat actuel n'est pas obligé de
 * l'utiliser ; exporté pour un rendu par sections ultérieur.
 */
export const EXERCISE_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Haltérophilie', keys: ['clean', 'power_clean', 'snatch', 'high_pull', 'push_press'] },
  { label: 'Bas du corps', keys: ['squat', 'front_squat', 'split_squat', 'lunge', 'step_up'] },
  {
    label: 'Chaîne postérieure',
    keys: [
      'deadlift',
      'romanian_deadlift',
      'good_morning',
      'hipthrust',
      'nordic_curl',
      'glute_bridge',
      'calf_raise',
    ],
  },
  { label: 'Haut du corps', keys: ['bench', 'incline_bench', 'ohp', 'row', 'pullup'] },
  { label: 'Gainage', keys: ['plank', 'side_plank', 'hollow_hold', 'leg_raise', 'pallof_press'] },
  {
    label: 'Pliométrie / Medball',
    keys: [
      'box_jump',
      'squat_jump',
      'drop_jump',
      'bounds',
      'medball_chest',
      'medball_overhead',
      'mountain_climbers',
    ],
  },
];

/** Charge cible (kg) = 1RM × % ⁄ 100, arrondie. `undefined` si l'exercice n'a pas de 1RM connu. */
export function targetLoadFromOneRm(exerciseKey: string, percent: number): number | undefined {
  const oneRm = ONE_RM_REFERENCE[exerciseKey];
  if (oneRm == null) return undefined;
  return Math.round((oneRm * percent) / 100);
}

/**
 * Exercice de musculation typé (`strength`) : `name` (libellé), base `sets`/`reps`/`load`, et
 * params additifs `tempo`/`rpe`/`exerciseKey` (ADR-41 §2/§3). `exerciseKey` est stocké pour que
 * la carte puisse recalculer la charge cible %1RM. `loadUnit` retombe sur `% 1RM` quand une
 * `loadValue` est fournie sans unité explicite.
 */
function strengthExercise(opts: {
  exerciseKey: string;
  sets: number;
  reps: number;
  loadValue?: number;
  loadUnit?: LoadUnit | null;
  rpe?: number;
  tempo?: string;
}): EditableBlock {
  const params: Record<string, string> = { exerciseKey: opts.exerciseKey };
  if (opts.tempo) params.tempo = opts.tempo;
  if (opts.rpe != null) params.rpe = String(opts.rpe);
  const block = makeBlock({
    type: BlockType.strength,
    name: EXERCISE_LABELS[opts.exerciseKey] ?? opts.exerciseKey,
    sets: String(opts.sets),
    reps: String(opts.reps),
    params,
  });
  if (opts.loadValue != null) {
    block.loadValue = String(opts.loadValue);
    block.loadUnit = opts.loadUnit ?? LoadUnit.percent_1rm;
  } else if (opts.loadUnit != null) {
    block.loadUnit = opts.loadUnit;
  }
  return block;
}

/**
 * Station PPG typée (`core`) : travail en durée (`durationSeconds`) **ou** répétitions (`reps`),
 * récup `restSeconds`. Les tours sont portés par le `rounds` du groupe circuit (ADR-41 §2).
 */
function ppgStation(opts: {
  name: string;
  workSeconds?: number;
  reps?: number;
  recoverySeconds?: number;
}): EditableBlock {
  const block = makeBlock({ type: BlockType.core, name: opts.name });
  if (opts.workSeconds != null) block.durationSeconds = String(opts.workSeconds);
  if (opts.reps != null) block.reps = String(opts.reps);
  if (opts.recoverySeconds != null) block.restSeconds = String(opts.recoverySeconds);
  return block;
}

/**
 * Presets Renforcement / PPG (ADR-41 §7).
 *
 * Modèle de données — décision ADR-41 :
 * - **Muscu** : chaque exercice = un bloc `strength` **de premier niveau** (non groupé). Motif :
 *   `sets` est **masqué dans un groupe** (`isBaseFieldVisible`, ADR-27 règle 6), or les séries
 *   varient d'un exercice à l'autre ; un bloc top-level conserve donc son propre `sets` visible.
 *   Le « bloc de travail / carte série » est un regroupement **visuel** géré par la carte (phase B),
 *   pas un `EditableGroup`.
 * - **PPG** : les stations partagent les tours → `makeSeriesGroup(groupType:'circuit')`,
 *   `rounds` = nb de tours ; `sets` masqué (correct, porté par `rounds`).
 */
export const STRENGTH_PRESETS: SessionBuilderPreset[] = [
  {
    key: 'force_max',
    label: 'Force max',
    build: () => [
      strengthExercise({ exerciseKey: 'squat', sets: 4, reps: 5, loadValue: 85, tempo: '31X1' }),
      strengthExercise({
        exerciseKey: 'deadlift',
        sets: 3,
        reps: 4,
        loadValue: 80,
        tempo: '20X0',
      }),
    ],
  },
  {
    key: 'hypertrophy',
    label: 'Hypertrophie',
    build: () => [
      strengthExercise({ exerciseKey: 'squat', sets: 4, reps: 10, loadValue: 70, tempo: '2010' }),
      strengthExercise({ exerciseKey: 'bench', sets: 4, reps: 10, loadValue: 70, tempo: '2010' }),
    ],
  },
  {
    key: 'power',
    label: 'Force-vitesse / Puissance',
    build: () => [
      strengthExercise({ exerciseKey: 'squat', sets: 5, reps: 3, loadValue: 50, tempo: 'X0X0' }),
    ],
  },
  {
    key: 'plyo',
    label: 'Pliométrie',
    build: () => [
      strengthExercise({
        exerciseKey: 'squat',
        sets: 5,
        reps: 5,
        loadUnit: LoadUnit.bodyweight,
        tempo: 'X0X0',
      }),
    ],
  },
  {
    key: 'circuit_ppg',
    label: 'Circuit PPG',
    build: () => [
      makeSeriesGroup({
        name: 'Circuit PPG',
        groupType: 'circuit',
        rounds: '3',
        restBetweenRoundsSeconds: '60',
        items: [
          ppgStation({ name: 'Squats sautés', workSeconds: 40, recoverySeconds: 20 }),
          ppgStation({ name: 'Pompes', workSeconds: 40, recoverySeconds: 20 }),
          ppgStation({ name: 'Fentes', workSeconds: 40, recoverySeconds: 20 }),
          ppgStation({ name: 'Burpees', workSeconds: 40, recoverySeconds: 20 }),
          ppgStation({ name: 'Gainage', workSeconds: 40, recoverySeconds: 20 }),
          ppgStation({ name: 'Squats', workSeconds: 40, recoverySeconds: 20 }),
        ],
      }),
    ],
  },
  {
    key: 'core_ppg',
    label: 'Gainage',
    build: () => [
      makeSeriesGroup({
        name: 'Gainage',
        groupType: 'circuit',
        rounds: '3',
        restBetweenRoundsSeconds: '60',
        items: [
          ppgStation({ name: 'Planche', workSeconds: 45, recoverySeconds: 15 }),
          ppgStation({ name: 'Gainage latéral', workSeconds: 30, recoverySeconds: 15 }),
          ppgStation({ name: 'Mountain climbers', reps: 20, recoverySeconds: 15 }),
          ppgStation({ name: 'Superman', workSeconds: 30, recoverySeconds: 15 }),
        ],
      }),
    ],
  },
];

/** Presets par discipline (ADR-38, TLX-155→159 ; ADR-41 TLX-172). */
const ASSISTANT_PRESETS: Record<DisciplineKey, SessionBuilderPreset[]> = {
  sprint: SPRINT_PRESETS,
  hurdles: HURDLES_PRESETS,
  endurance: ENDURANCE_PRESETS,
  jumps: JUMPS_PRESETS,
  throws: THROWS_PRESETS,
  strength: STRENGTH_PRESETS,
};

/** Presets de la discipline (ou liste vide si inconnue/non encore fournis). */
export function assistantPresets(discipline: string | undefined): SessionBuilderPreset[] {
  const cfg = disciplineConfig(discipline);
  return cfg ? ASSISTANT_PRESETS[cfg.key] : [];
}

/**
 * Canvas initial d'un assistant : une **série** unique de la discipline avec un effort typé,
 * prête à éditer/compléter. Fournit la structure (série + type) sans imposer de valeurs.
 */
export function assistantSeed(discipline: string | undefined): EditableNode[] {
  const cfg = disciplineConfig(discipline);
  if (!cfg) return [];
  const series = makeSeriesGroup({
    name: `Série de ${cfg.effortLabel.toLowerCase()}`,
    rounds: '1',
    items: [makeBlock({ type: cfg.blockType, name: cfg.effortLabel })],
  });
  // Sprint : amorce avec échauffement + 1 sprint par défaut + retour au calme (ADR-39, TLX-165).
  if (cfg.key === 'sprint') {
    const sprintSeries = makeSeriesGroup({
      name: 'Série de sprint',
      rounds: '1',
      restBetweenRoundsSeconds: '300',
      items: [
        makeBlock({
          type: BlockType.sprint,
          name: '60 m',
          params: {
            reps: '1',
            distanceMeters: '60',
            recoverySeconds: '240',
            intensityMode: 'percent_record',
            intensityValue: '95',
            startType: 'blocks',
            flyingZone: 'false',
          },
        }),
      ],
    });
    return [makeWarmupBlock(), sprintSeries, makeCooldownBlock()];
  }
  // Renforcement / PPG : amorce avec le preset Force max (blocs `strength` top-level), encadré
  // d'un échauffement et d'un retour au calme (même esprit que Sprint, ADR-41).
  if (cfg.key === 'strength') {
    const forceMax = STRENGTH_PRESETS.find((p) => p.key === 'force_max');
    return [makeWarmupBlock(), ...(forceMax ? forceMax.build() : []), makeCooldownBlock()];
  }
  return [series];
}
