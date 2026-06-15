import { BlockType } from '@talent-x/api-client';
import {
  makeBlock,
  makeSeriesGroup,
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

/** Presets par discipline (vides tant que l'assistant dédié n'est pas livré). */
const ASSISTANT_PRESETS: Record<DisciplineKey, SessionBuilderPreset[]> = {
  sprint: SPRINT_PRESETS,
  hurdles: [],
  endurance: [],
  jumps: [],
  throws: [],
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
  return [
    makeSeriesGroup({
      name: `Série de ${cfg.effortLabel.toLowerCase()}`,
      rounds: '1',
      items: [makeBlock({ type: cfg.blockType, name: cfg.effortLabel })],
    }),
  ];
}
