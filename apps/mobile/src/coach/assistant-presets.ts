import { BlockType } from '@talent-x/api-client';
import {
  makeBlock,
  makeSeriesGroup,
  type EditableBlock,
  type EditableNode,
} from './session-builder-ui';
import { makeCooldownBlock, makeWarmupBlock } from './sprint-effort-card';
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

/** Presets Sprint repris de la maquette (ADR-38, TLX-155). */
const SPRINT_PRESETS: SessionBuilderPreset[] = [
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
      leadLeg: 'left',
      startType: 'blocks',
      recoverySeconds: String(opts.recoverySeconds),
    },
  });
}

const HURDLES_PRESETS: SessionBuilderPreset[] = [
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

const ENDURANCE_PRESETS: SessionBuilderPreset[] = [
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
      takeoff: 'left',
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

const JUMPS_PRESETS: SessionBuilderPreset[] = [
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
}): EditableBlock {
  const params: Record<string, string> = {
    discipline: opts.discipline,
    sex: opts.sex,
    implementState: opts.implementState ?? 'regulation',
  };
  const kg = regulationImplementKg(opts.discipline, opts.sex);
  if (kg != null) params.implementKg = String(kg);
  if (opts.techniqueThrows != null) params.techniqueThrows = String(opts.techniqueThrows);
  if (opts.fullThrows != null) params.fullThrows = String(opts.fullThrows);
  if (opts.style) params.style = opts.style;
  return makeBlock({ type: BlockType.throws, name: opts.name, params });
}

const THROWS_PRESETS: SessionBuilderPreset[] = [
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
            techniqueThrows: 10,
            fullThrows: 0,
            style: 'spin',
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
            techniqueThrows: 2,
            fullThrows: 6,
            style: 'spin',
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
            fullThrows: 8,
            style: 'glide',
          }),
        ],
      }),
    ],
  },
];

/** Presets par discipline (ADR-38, TLX-155→159). */
const ASSISTANT_PRESETS: Record<DisciplineKey, SessionBuilderPreset[]> = {
  sprint: SPRINT_PRESETS,
  hurdles: HURDLES_PRESETS,
  endurance: ENDURANCE_PRESETS,
  jumps: JUMPS_PRESETS,
  throws: THROWS_PRESETS,
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
  return [series];
}
