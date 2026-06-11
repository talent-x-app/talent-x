import {
  BlockType,
  LoadUnit,
  type Exercise,
  type ExerciseGroup,
  type ExerciseGroupGroupType,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { isExerciseGroup, type ExerciseNode } from '../sessions/exercises-doc';

/**
 * Couche UI partagée du constructeur de séance (C-05). Le backend accepte le contrat
 * `exercises` **v2** (ADR-18) : base commune `{ name, order, sets?, reps?, durationSeconds?,
 * restSeconds?, load?, notes? }` + discriminant `type` (`BlockType`) + conteneur `params`
 * propre au type. Le **sélecteur de type** (TLX-053) et les **éditeurs de params** par
 * discipline (TLX-054→061) sont pilotés par le registre `BLOCK_TYPE_SPECS` : ajouter une
 * discipline = ajouter une entrée (libellé + `paramFields`), aucun autre câblage.
 */

/** Bloc en cours d'édition : tous les champs numériques sont des chaînes (saisie libre). */
export interface EditableBlock {
  /** Clé stable côté client pour le rendu de liste (préservée au réordonnancement). */
  key: string;
  name: string;
  /** Discipline du bloc (défaut `custom` = bloc générique, cf. ADR-18). */
  type: BlockType;
  sets: string;
  reps: string;
  durationSeconds: string;
  restSeconds: string;
  loadValue: string;
  loadUnit: LoadUnit | null;
  notes: string;
  /** Saisie brute des `params` propres au type, indexée par clé de champ. */
  params: Record<string, string>;
}

/**
 * Groupe d'exercices répété en tours/séries (ADR-27, exercises v3). Contient des `EditableBlock`
 * **à un seul niveau** (jamais un groupe imbriqué — garanti côté backend). La dimension
 * « série » est portée par `rounds` (le champ de base `sets` des membres est masqué, règle 6).
 */
export interface EditableGroup {
  key: string;
  /** Discriminant de nœud — présent uniquement sur un groupe. */
  kind: 'group';
  name: string;
  /** Sémantique d'affichage/guidage (superset / circuit / série). */
  groupType: ExerciseGroupGroupType;
  /** Nombre de tours/séries (chaîne libre, ≥ 1 à la sérialisation). */
  rounds: string;
  /** r — récup entre exercices d'un même tour (s). */
  restBetweenItemsSeconds: string;
  /** R — récup entre tours (s). */
  restBetweenRoundsSeconds: string;
  notes: string;
  items: EditableBlock[];
}

/** Nœud du canvas : bloc simple ou groupe d'exercices (ADR-27). */
export type EditableNode = EditableBlock | EditableGroup;

/** Le nœud est-il un groupe éditable ? */
export function isEditableGroup(node: EditableNode): node is EditableGroup {
  return (node as EditableGroup).kind === 'group';
}

/** Libellés FR des sémantiques de groupe (`groupType`). */
export const GROUP_TYPE_LABELS: Record<ExerciseGroupGroupType, string> = {
  superset: 'Superset',
  circuit: 'Circuit',
  series: 'Série',
};

/** Champ de `params` propre à un type de bloc (saisie numérique ou choix discret). */
export interface BlockParamField {
  key: string;
  label: string;
  placeholder?: string;
  /**
   * `int` (défaut) / `number` (décimal autorisé, ex. espacement en m) → saisie numérique ;
   * `select` → choix parmi `options` (param libre en chaîne, ex. discipline, cf. ADR-25) ;
   * `text` → chaîne libre courte (ex. tempo « 3-1-1-0 », cf. ADR-28 règle 6).
   */
  kind?: 'int' | 'number' | 'select' | 'text';
  /** Options d'un champ `select` (valeur stockée + libellé affiché). */
  options?: { value: string; label: string }[];
  /**
   * Param **requis** pour dériver l'épreuve d'un record/courbe (TLX-91). Sans lui, la perf
   * saisie sur ce bloc serait ignorée par `record-detection.ts` → aucune progression. Le
   * constructeur bloque l'enregistrement tant qu'il manque (cf. `firstBlockMissingRequiredParam`).
   */
  required?: boolean;
}

/** Spécification d'un type de bloc : libellé FR + champs `params` (le cas échéant). */
export interface BlockTypeSpec {
  type: BlockType;
  label: string;
  paramFields?: BlockParamField[];
}

/**
 * Params partagés des blocs de type circuit (TLX-061) : Gainage / Circuit / Échauffement /
 * Retour au calme partagent un même éditeur (tours + durée par station ; la durée totale
 * reste portée par le champ de base `durationSeconds`).
 */
const CIRCUIT_PARAM_FIELDS: BlockParamField[] = [
  { key: 'rounds', label: 'Tours (nombre de circuits)', placeholder: 'Ex. 3' },
  { key: 'stationSeconds', label: 'Durée par station (s)', placeholder: 'Ex. 45' },
];

/**
 * Registre des types de bloc (TLX-053). Chaque éditeur typé (TLX-054→061) renseigne ses
 * `paramFields` ici — le sélecteur et l'éditeur de params s'en déduisent automatiquement.
 * `custom` (défaut) et les types sans `paramFields` n'utilisent que la base commune.
 */
export const BLOCK_TYPE_SPECS: BlockTypeSpec[] = [
  { type: BlockType.custom, label: 'Personnalisé' },
  {
    type: BlockType.strength,
    label: 'Musculation',
    // TLX-060 — Musculation : séries × reps × charge = base v1 générique ; `strength` tagge le
    // bloc. ADR-28 (règle 6) ajoute le tempo d'exécution (chaîne libre optionnelle) — sans lui,
    // le bloc reste byte-identique au v1 (aucun `params` sérialisé).
    paramFields: [
      {
        key: 'tempo',
        label: 'Tempo (excentrique-pause-concentrique-pause)',
        placeholder: 'Ex. 3-1-1-0',
        kind: 'text',
      },
    ],
  },
  {
    type: BlockType.interval,
    label: 'Intervalles',
    // TLX-054 — Fractionné / Intervalles. `distanceMeters` (par répétition) dérive l'épreuve
    // chronométrée → requis pour le suivi de progression (TLX-91). Intensité % VMA : ADR-28
    // règle 6 (jamais d'exercice « nu »).
    paramFields: [
      { key: 'reps', label: 'Répétitions (nombre d’intervalles)', placeholder: 'Ex. 6' },
      {
        key: 'distanceMeters',
        label: 'Distance par répétition (m)',
        placeholder: 'Ex. 400',
        required: true,
      },
      { key: 'workSeconds', label: 'Effort (s)', placeholder: 'Ex. 90' },
      { key: 'recoverySeconds', label: 'Récupération (s)', placeholder: 'Ex. 120' },
      { key: 'percentVma', label: 'Intensité (% VMA)', placeholder: 'Ex. 105' },
    ],
  },
  {
    type: BlockType.sprint,
    label: 'Sprints',
    // TLX-055 — Répétitions de vitesse / Sprints : distances, répétitions, récupération.
    // `distanceMeters` dérive l'épreuve chronométrée → requis pour le suivi (TLX-91).
    // Intensité % VMA : ADR-28 règle 6.
    paramFields: [
      { key: 'reps', label: 'Répétitions (nombre de sprints)', placeholder: 'Ex. 8' },
      { key: 'distanceMeters', label: 'Distance (m)', placeholder: 'Ex. 60', required: true },
      { key: 'recoverySeconds', label: 'Récupération (s)', placeholder: 'Ex. 180' },
      { key: 'percentVma', label: 'Intensité (% VMA)', placeholder: 'Ex. 120' },
    ],
  },
  {
    type: BlockType.endurance,
    label: 'Course / Endurance',
    // TLX-056 — Course continue / Tempo / Côtes / Fartlek : allure cible, dénivelé.
    // `distanceMeters` dérive l'épreuve chronométrée → requis pour le suivi (TLX-91).
    paramFields: [
      { key: 'distanceMeters', label: 'Distance (m)', placeholder: 'Ex. 5000', required: true },
      { key: 'paceSecondsPerKm', label: 'Allure cible (s/km)', placeholder: 'Ex. 300' },
      { key: 'elevationMeters', label: 'Dénivelé D+ (m)', placeholder: 'Ex. 120' },
    ],
  },
  {
    type: BlockType.hurdles,
    label: 'Haies',
    // TLX-057 — Haies : distance de course, rythme (appuis entre haies), hauteur, espacement.
    // `distanceMeters` (distance de l'épreuve, ex. 110 m haies) dérive l'épreuve chronométrée
    // → requis pour le suivi (TLX-91).
    paramFields: [
      {
        key: 'distanceMeters',
        label: 'Distance de course (m)',
        placeholder: 'Ex. 110',
        required: true,
      },
      { key: 'heightCm', label: 'Hauteur (cm)', placeholder: 'Ex. 84', kind: 'number' },
      { key: 'spacingMeters', label: 'Espacement (m)', placeholder: 'Ex. 8.5', kind: 'number' },
      { key: 'rhythmSteps', label: 'Rythme (appuis entre haies)', placeholder: 'Ex. 3' },
    ],
  },
  {
    type: BlockType.jumps,
    label: 'Sauts',
    // TLX-058 — Sauts : longueur d'élan, sauts complets, contacts pliométriques.
    paramFields: [
      {
        key: 'approachMeters',
        label: 'Longueur d’élan (m)',
        placeholder: 'Ex. 30',
        kind: 'number',
      },
      { key: 'fullJumps', label: 'Sauts complets (nombre)', placeholder: 'Ex. 6' },
      { key: 'plyoContacts', label: 'Contacts pliométriques (nombre)', placeholder: 'Ex. 40' },
    ],
  },
  {
    type: BlockType.throws,
    label: 'Lancers',
    // TLX-059 — Lancers : poids de l'engin + lancers technique vs complets.
    paramFields: [
      {
        key: 'implementKg',
        label: 'Poids de l’engin (kg)',
        placeholder: 'Ex. 7.26',
        kind: 'number',
        // Dérive l'épreuve (`throws:{kg}`) → requis pour le suivi (TLX-91).
        required: true,
      },
      { key: 'techniqueThrows', label: 'Lancers technique (nombre)', placeholder: 'Ex. 10' },
      { key: 'fullThrows', label: 'Lancers complets (nombre)', placeholder: 'Ex. 6' },
    ],
  },
  {
    type: BlockType.vertical_jumps,
    label: 'Hauteur / Perche',
    // TLX-075 (ADR-25) — Sauts verticaux : discipline (épreuve du record) + barre de départ
    // et montée (cm) qui pré-remplissent la grille de barres côté athlète.
    paramFields: [
      {
        key: 'discipline',
        label: 'Discipline',
        kind: 'select',
        options: [
          { value: 'high', label: 'Hauteur' },
          { value: 'pole', label: 'Perche' },
        ],
        // Détermine l'épreuve du record (`vertical:high|pole`) → requis pour ne pas classer
        // une perche en hauteur par défaut (TLX-91).
        required: true,
      },
      { key: 'startHeightCm', label: 'Barre de départ (cm)', placeholder: 'Ex. 165' },
      { key: 'incrementCm', label: 'Montée entre barres (cm)', placeholder: 'Ex. 5' },
    ],
  },
  // TLX-061 — Gainage / Circuit / Échauffement / Retour au calme : éditeur partagé.
  { type: BlockType.core, label: 'Gainage / Circuit', paramFields: CIRCUIT_PARAM_FIELDS },
  { type: BlockType.warmup, label: 'Échauffement', paramFields: CIRCUIT_PARAM_FIELDS },
  { type: BlockType.cooldown, label: 'Retour au calme', paramFields: CIRCUIT_PARAM_FIELDS },
];

/** Spécification d'un type (repli sur la première entrée, `custom`). */
export function specForType(type: BlockType): BlockTypeSpec {
  return BLOCK_TYPE_SPECS.find((s) => s.type === type) ?? BLOCK_TYPE_SPECS[0];
}

/** Champ de la base commune v1 dont l'affichage peut être supplanté par un `param` typé. */
export type BaseFieldKey = 'sets' | 'reps' | 'durationSeconds' | 'restSeconds';

/**
 * Redondance base ↔ params (TLX-94, ADR-18). Quand un type déclare un `param` couvrant la
 * **même dimension** qu'un champ de base v1, ce dernier ferait doublon (ex. Sprints : base
 * « Répétitions » vs param « nombre de sprints ») et n'alimente pas la dérivation métier. On
 * masque alors le champ de base. `sets` (jamais dupliqué) et la charge restent toujours.
 */
const BASE_FIELD_SUPERSEDED_BY: Partial<Record<BaseFieldKey, string[]>> = {
  reps: ['reps', 'fullJumps', 'techniqueThrows', 'fullThrows', 'rounds'],
  durationSeconds: ['workSeconds', 'stationSeconds'],
  restSeconds: ['recoverySeconds'],
};

/**
 * Le champ de base est-il pertinent ? Indexé par **type** (supplantation par un `param`,
 * TLX-94) **et contexte membre-de-groupe** (ADR-27 règle 6) : `sets` est masqué dans un groupe,
 * la dimension « série » étant portée par le `rounds` du groupe parent.
 */
export function isBaseFieldVisible(type: BlockType, key: BaseFieldKey, inGroup = false): boolean {
  if (key === 'sets' && inGroup) return false;
  const supersededBy = BASE_FIELD_SUPERSEDED_BY[key];
  if (!supersededBy) return true;
  const paramKeys = specForType(type).paramFields?.map((f) => f.key) ?? [];
  return !supersededBy.some((k) => paramKeys.includes(k));
}

/** Champs de base v1 affichés dans `BlockCard` (libellé + suffixe de testID). */
const BASE_FIELDS: { key: BaseFieldKey; testId: string; label: string }[] = [
  { key: 'sets', testId: 'sets', label: 'Séries' },
  { key: 'reps', testId: 'reps', label: 'Répétitions' },
  { key: 'durationSeconds', testId: 'duration', label: 'Durée (s)' },
  { key: 'restSeconds', testId: 'rest', label: 'Repos (s)' },
];

/** Regroupe une liste en paires successives (lignes de deux champs). */
function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

/** Libellés FR des unités de charge (schéma `Load.unit`). */
export const LOAD_UNIT_LABELS: Record<LoadUnit, string> = {
  [LoadUnit.kg]: 'kg',
  [LoadUnit.lb]: 'lb',
  [LoadUnit.percent_1rm]: '% 1RM',
  [LoadUnit.bodyweight]: 'poids du corps',
};

let blockKeyCounter = 0;
/** Génère une clé client unique (monotone, pas de dépendance à l'horloge). */
export function nextBlockKey(): string {
  blockKeyCounter += 1;
  return `block-${blockKeyCounter}`;
}

/** Nouveau bloc vide (type `custom` par défaut). */
export function makeEmptyBlock(): EditableBlock {
  return {
    key: nextBlockKey(),
    name: '',
    type: BlockType.custom,
    sets: '',
    reps: '',
    durationSeconds: '',
    restSeconds: '',
    loadValue: '',
    loadUnit: null,
    notes: '',
    params: {},
  };
}

/** Nouveau groupe vide (`circuit` par défaut, ADR-27 règle 1) avec un exercice initial. */
export function makeEmptyGroup(): EditableGroup {
  return {
    key: nextBlockKey(),
    kind: 'group',
    name: '',
    groupType: 'circuit',
    rounds: '',
    restBetweenItemsSeconds: '',
    restBetweenRoundsSeconds: '',
    notes: '',
    items: [makeEmptyBlock()],
  };
}

/** Hydrate un bloc éditable depuis un `Exercise` du contrat (feuille). */
function blockFromExercise(ex: Exercise): EditableBlock {
  const type = (ex.type ?? BlockType.custom) as BlockType;
  const src = (ex.params ?? {}) as Record<string, unknown>;
  const params: Record<string, string> = {};
  specForType(type).paramFields?.forEach((f) => {
    if (src[f.key] != null) params[f.key] = String(src[f.key]);
  });
  return {
    key: nextBlockKey(),
    name: ex.name,
    type,
    sets: ex.sets != null ? String(ex.sets) : '',
    reps: ex.reps != null ? String(ex.reps) : '',
    durationSeconds: ex.durationSeconds != null ? String(ex.durationSeconds) : '',
    restSeconds: ex.restSeconds != null ? String(ex.restSeconds) : '',
    loadValue: ex.load != null ? String(ex.load.value) : '',
    loadUnit: ex.load?.unit ?? null,
    notes: ex.notes ?? '',
    params,
  };
}

/** Hydrate un groupe éditable depuis un `ExerciseGroup` (membres triés par `order`). */
function groupFromExercise(group: ExerciseGroup): EditableGroup {
  return {
    key: nextBlockKey(),
    kind: 'group',
    name: group.name,
    groupType: group.groupType ?? 'circuit',
    rounds: group.rounds != null ? String(group.rounds) : '',
    restBetweenItemsSeconds:
      group.restBetweenItemsSeconds != null ? String(group.restBetweenItemsSeconds) : '',
    restBetweenRoundsSeconds:
      group.restBetweenRoundsSeconds != null ? String(group.restBetweenRoundsSeconds) : '',
    notes: group.notes ?? '',
    items: [...(group.items ?? [])].sort((a, b) => a.order - b.order).map(blockFromExercise),
  };
}

/**
 * Hydrate le canvas éditable depuis un `ExercisesDoc` existant (mode édition). Un document v3
 * (ADR-27) mêle exercices et **groupes** : les deux sont préservés (round-trip sans perte).
 * Tri des nœuds de premier niveau par `order` global (groupes et feuilles confondus, règle 4).
 */
export function nodesFromExercises(items: readonly ExerciseNode[]): EditableNode[] {
  return [...(items ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((node) => (isExerciseGroup(node) ? groupFromExercise(node) : blockFromExercise(node)));
}

/** Entier positif depuis une chaîne, ou `undefined` si vide/invalide. */
function toPositiveInt(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

/** Nombre positif depuis une chaîne, ou `undefined` si vide/invalide. */
function toPositiveNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Sérialise un bloc éditable en `Exercise` du contrat (order injecté par l'appelant). `inGroup`
 * (membre d'un groupe, ADR-27) masque `sets` (porté par le `rounds` du groupe — règle 6).
 */
export function blockToExercise(block: EditableBlock, order: number, inGroup = false): Exercise {
  const loadValue = toPositiveNumber(block.loadValue);
  const exercise: Exercise = { name: block.name.trim(), order };
  // `type` n'est posé que pour une discipline (un bloc `custom` reste byte-identique au v1).
  if (block.type !== BlockType.custom) exercise.type = block.type;
  // Champs de base : sérialisés seulement s'ils sont visibles pour le type — un champ
  // supplanté par un `param` (TLX-94) ou masqué en groupe (ADR-27) ne doit pas fuiter.
  const sets = toPositiveInt(block.sets);
  const reps = toPositiveInt(block.reps);
  const durationSeconds = toPositiveInt(block.durationSeconds);
  const restSeconds = toPositiveInt(block.restSeconds);
  if (sets != null && isBaseFieldVisible(block.type, 'sets', inGroup)) exercise.sets = sets;
  if (reps != null && isBaseFieldVisible(block.type, 'reps', inGroup)) exercise.reps = reps;
  if (durationSeconds != null && isBaseFieldVisible(block.type, 'durationSeconds', inGroup)) {
    exercise.durationSeconds = durationSeconds;
  }
  if (restSeconds != null && isBaseFieldVisible(block.type, 'restSeconds', inGroup)) {
    exercise.restSeconds = restSeconds;
  }
  // La charge n'est attachée que si une valeur ET une unité sont renseignées (contrat `Load`).
  if (loadValue != null && block.loadUnit != null) {
    exercise.load = { value: loadValue, unit: block.loadUnit };
  }
  const notes = block.notes.trim();
  if (notes !== '') exercise.notes = notes;
  // `params` propres au type : champs parsés, attachés seulement si au moins un est rempli.
  // Les champs `select` stockent une chaîne (valeur d'option), `text` une chaîne libre épurée,
  // les autres un nombre positif.
  const paramFields = specForType(block.type).paramFields;
  if (paramFields?.length) {
    const params: Record<string, number | string> = {};
    paramFields.forEach((f) => {
      if (f.kind === 'select') {
        const raw = (block.params[f.key] ?? '').trim();
        if (raw !== '' && f.options?.some((o) => o.value === raw)) params[f.key] = raw;
        return;
      }
      if (f.kind === 'text') {
        const raw = (block.params[f.key] ?? '').trim();
        if (raw !== '') params[f.key] = raw;
        return;
      }
      const raw = block.params[f.key] ?? '';
      const n = f.kind === 'number' ? toPositiveNumber(raw) : toPositiveInt(raw);
      if (n != null) params[f.key] = n;
    });
    if (Object.keys(params).length > 0) exercise.params = params;
  }
  return exercise;
}

/** Sérialise un groupe éditable en `ExerciseGroup` (membres déjà sérialisés, order global). */
export function groupToExerciseGroup(
  group: EditableGroup,
  order: number,
  items: Exercise[],
): ExerciseGroup {
  const result: ExerciseGroup = {
    kind: 'group',
    name: group.name.trim(),
    order,
    groupType: group.groupType,
    // Contrat : entier ≥ 1 ; une saisie vide/invalide retombe sur 1 tour.
    rounds: toPositiveInt(group.rounds) ?? 1,
    items,
  };
  const r = toPositiveInt(group.restBetweenItemsSeconds);
  if (r != null) result.restBetweenItemsSeconds = r;
  const bigR = toPositiveInt(group.restBetweenRoundsSeconds);
  if (bigR != null) result.restBetweenRoundsSeconds = bigR;
  const notes = group.notes.trim();
  if (notes !== '') result.notes = notes;
  return result;
}

/**
 * Sérialise le canvas en items `exercises` v3 (ADR-27). **`order` global unique** en parcours
 * de lecture : un compteur incrémente sur chaque nœud — un groupe puis chacun de ses membres
 * (règle 4) — de sorte que les **feuilles** gardent un `order` unique (la jointure `results`
 * par `order` reste déterministe même avec des noms dupliqués entre groupes successifs).
 */
export function nodesToItems(nodes: EditableNode[]): (Exercise | ExerciseGroup)[] {
  let order = 0;
  return nodes.map((node) => {
    if (isEditableGroup(node)) {
      order += 1;
      const groupOrder = order;
      const items = node.items.map((block) => {
        order += 1;
        return blockToExercise(block, order, true);
      });
      return groupToExerciseGroup(node, groupOrder, items);
    }
    order += 1;
    return blockToExercise(node, order, false);
  });
}

/**
 * Premier `param` **requis** (TLX-91) manquant/invalide d'un bloc — `null` sinon. Garantit qu'un
 * bloc typé dérivant une épreuve (sprint/haies/course/intervalle → distance, lancer → engin,
 * vertical → discipline) porte la donnée sans laquelle la perf n'apparaîtrait jamais en
 * progression. Mêmes règles de parsing que `blockToExercise` / `record-detection.ts`.
 */
function blockMissingRequiredParam(block: EditableBlock): BlockParamField | null {
  for (const field of specForType(block.type).paramFields ?? []) {
    if (!field.required) continue;
    const raw = (block.params[field.key] ?? '').trim();
    if (field.kind === 'select') {
      if (raw === '' || !field.options?.some((o) => o.value === raw)) return field;
      continue;
    }
    if (field.kind === 'text') {
      if (raw === '') return field;
      continue;
    }
    const n = field.kind === 'number' ? toPositiveNumber(raw) : toPositiveInt(raw);
    if (n == null || n <= 0) return field;
  }
  return null;
}

/**
 * Première anomalie bloquant l'enregistrement, en **parcours de lecture group-aware** (les
 * membres de groupe sont traversés — sans quoi les gardes TLX-91/nom ne couvriraient plus un
 * bloc en groupe). Renvoie un message prêt à afficher, ou `null` si tout est valide. La
 * numérotation « Bloc N » suit l'ordre des **feuilles** (aligné sur ce que voit l'athlète).
 */
export function findFirstNodeIssue(nodes: EditableNode[]): { message: string } | null {
  let leaf = 0;
  const checkBlock = (block: EditableBlock): { message: string } | null => {
    leaf += 1;
    if (block.name.trim() === '') {
      return { message: `Le bloc ${leaf} n'a pas de nom d'exercice.` };
    }
    const field = blockMissingRequiredParam(block);
    if (field) {
      return {
        message:
          `Bloc ${leaf} : renseigne « ${field.label} » ` + '(nécessaire au suivi de progression).',
      };
    }
    return null;
  };

  for (const node of nodes) {
    if (isEditableGroup(node)) {
      if (node.name.trim() === '') {
        return { message: 'Donne un nom à chaque groupe d’exercices.' };
      }
      if (node.items.length === 0) {
        return { message: `Le groupe « ${node.name.trim()} » doit contenir au moins un exercice.` };
      }
      for (const member of node.items) {
        const issue = checkBlock(member);
        if (issue) return issue;
      }
    } else {
      const issue = checkBlock(node);
      if (issue) return issue;
    }
  }
  return null;
}

/**
 * Carte d'édition d'un bloc générique : nom, séries/reps, durée/repos, charge, notes. Purement
 * présentationnelle — réutilisée **telle quelle** au premier niveau et dans un groupe (ADR-27).
 * `testIDPrefix` namespace les testIDs (défaut `block-{index}` → compat plat) ; `inGroup` masque
 * `sets` (porté par le `rounds` du groupe) ; `onGroup`/`onUngroup` exposent les déplacements
 * dans/hors d'un groupe quand le contexte le permet.
 */
export function BlockCard({
  block,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  testIDPrefix,
  label,
  inGroup = false,
  onGroup,
  groupDisabled,
  onUngroup,
}: {
  block: EditableBlock;
  index: number;
  total: number;
  onChange: (patch: Partial<EditableBlock>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  testIDPrefix?: string;
  label?: string;
  inGroup?: boolean;
  onGroup?: () => void;
  groupDisabled?: boolean;
  onUngroup?: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const tid = testIDPrefix ?? `block-${index}`;

  return (
    <Card testID={tid}>
      <View style={{ gap: spacing[3] }}>
        {/* En-tête de bloc : numéro + contrôles d'ordre / groupe / suppression. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text
            style={{
              flex: 1,
              color: colors.textMuted,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            {label ?? `Bloc ${index + 1}`}
          </Text>
          {onGroup ? (
            <IconButton
              testID={`${tid}-group`}
              icon="folder-plus"
              label="Déplacer dans le groupe voisin"
              disabled={groupDisabled}
              onPress={onGroup}
            />
          ) : null}
          {onUngroup ? (
            <IconButton
              testID={`${tid}-ungroup`}
              icon="corner-up-left"
              label="Sortir du groupe"
              onPress={onUngroup}
            />
          ) : null}
          <IconButton
            testID={`${tid}-up`}
            icon="arrow-up"
            label="Monter le bloc"
            disabled={index === 0}
            onPress={onMoveUp}
          />
          <IconButton
            testID={`${tid}-down`}
            icon="arrow-down"
            label="Descendre le bloc"
            disabled={index === total - 1}
            onPress={onMoveDown}
          />
          <IconButton
            testID={`${tid}-remove`}
            icon="trash-2"
            label="Supprimer le bloc"
            tone="danger"
            onPress={onRemove}
          />
        </View>

        <FieldInput
          testID={`${tid}-name`}
          label="Nom de l'exercice"
          value={block.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Ex. Squat arrière, 60m départ…"
        />

        <BlockTypeSelector tid={tid} value={block.type} onChange={(type) => onChange({ type })} />

        {/* Champs de base v1 : seuls ceux pertinents pour le type ET le contexte sont affichés
            (TLX-94 + ADR-27 : `sets` masqué en groupe), disposés en lignes de deux. */}
        {chunkPairs(BASE_FIELDS.filter((f) => isBaseFieldVisible(block.type, f.key, inGroup))).map(
          (pair, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: 'row', gap: spacing[3] }}>
              {pair.map((f) => (
                <FieldInput
                  key={f.key}
                  testID={`${tid}-${f.testId}`}
                  label={f.label}
                  value={block[f.key]}
                  onChangeText={(v) => onChange({ [f.key]: v } as Partial<EditableBlock>)}
                  keyboardType="number-pad"
                  placeholder="—"
                  style={{ flex: 1 }}
                />
              ))}
              {/* Conserve la demi-largeur quand la ligne n'a qu'un champ. */}
              {pair.length === 1 ? <View style={{ flex: 1 }} /> : null}
            </View>
          ),
        )}

        {/* Charge : valeur + unité. Attachée à la séance seulement si les deux sont posées. */}
        <View style={{ gap: spacing[2] }}>
          <FieldInput
            testID={`${tid}-load`}
            label="Charge (optionnel)"
            value={block.loadValue}
            onChangeText={(loadValue) => onChange({ loadValue })}
            keyboardType="numeric"
            placeholder="Valeur"
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {(Object.keys(LOAD_UNIT_LABELS) as LoadUnit[]).map((unit) => (
              <Chip
                key={unit}
                testID={`${tid}-unit-${unit}`}
                selected={block.loadUnit === unit}
                onPress={() => onChange({ loadUnit: block.loadUnit === unit ? null : unit })}
              >
                {LOAD_UNIT_LABELS[unit]}
              </Chip>
            ))}
          </View>
        </View>

        <BlockParamsEditor tid={tid} block={block} onChange={onChange} />

        <FieldInput
          testID={`${tid}-notes`}
          label="Notes (optionnel)"
          value={block.notes}
          onChangeText={(notes) => onChange({ notes })}
          placeholder="Consignes, intention…"
          multiline
        />
      </View>
    </Card>
  );
}

/**
 * Carte d'édition d'un **groupe d'exercices** (ADR-27) : nom, `groupType` (superset/circuit/
 * série), `rounds`, récup intra-tour (r) et inter-tours (R), notes — contenant des `BlockCard`
 * membres (réutilisées telles quelles, contexte `inGroup`). Un membre peut sortir du groupe ;
 * supprimer le dernier membre supprime le groupe (géré par l'écran).
 */
export function GroupCard({
  group,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
  onMemberChange,
  onMemberMoveUp,
  onMemberMoveDown,
  onMemberRemove,
  onMemberUngroup,
  onAddMember,
}: {
  group: EditableGroup;
  index: number;
  total: number;
  onChange: (patch: Partial<EditableGroup>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onMemberChange: (memberIndex: number, patch: Partial<EditableBlock>) => void;
  onMemberMoveUp: (memberIndex: number) => void;
  onMemberMoveDown: (memberIndex: number) => void;
  onMemberRemove: (memberIndex: number) => void;
  onMemberUngroup: (memberIndex: number) => void;
  onAddMember: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const tid = `group-${index}`;
  const superset = group.groupType === 'superset';

  return (
    <Card testID={tid} style={{ borderColor: colors.accent, borderWidth: 1.5 }}>
      <View style={{ gap: spacing[3] }}>
        {/* En-tête de groupe : libellé + contrôles d'ordre / suppression. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Feather name="repeat" size={15} color={colors.accentText} />
          <Text
            style={{
              flex: 1,
              color: colors.accentText,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Groupe {index + 1}
          </Text>
          <IconButton
            testID={`${tid}-up`}
            icon="arrow-up"
            label="Monter le groupe"
            disabled={index === 0}
            onPress={onMoveUp}
          />
          <IconButton
            testID={`${tid}-down`}
            icon="arrow-down"
            label="Descendre le groupe"
            disabled={index === total - 1}
            onPress={onMoveDown}
          />
          <IconButton
            testID={`${tid}-remove`}
            icon="trash-2"
            label="Supprimer le groupe"
            tone="danger"
            onPress={onRemove}
          />
        </View>

        <FieldInput
          testID={`${tid}-name`}
          label="Nom du groupe"
          value={group.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Ex. Contraste force-vitesse, Circuit PPG…"
        />

        {/* Sémantique du groupe (affichage/guidage — superset numérote A1/A2 côté athlète). */}
        <View style={{ gap: spacing[2] }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Type de groupe
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {(Object.keys(GROUP_TYPE_LABELS) as ExerciseGroupGroupType[]).map((gt) => (
              <Chip
                key={gt}
                testID={`${tid}-type-${gt}`}
                selected={group.groupType === gt}
                onPress={() => onChange({ groupType: gt })}
              >
                {GROUP_TYPE_LABELS[gt]}
              </Chip>
            ))}
          </View>
        </View>

        {/* Tours + récupérations r (intra-tour) / R (inter-tours). */}
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <FieldInput
            testID={`${tid}-rounds`}
            label="Tours / séries"
            value={group.rounds}
            onChangeText={(rounds) => onChange({ rounds })}
            keyboardType="number-pad"
            placeholder="Ex. 3"
            style={{ flex: 1 }}
          />
          <FieldInput
            testID={`${tid}-rest-items`}
            label="Récup. r — entre exos (s)"
            value={group.restBetweenItemsSeconds}
            onChangeText={(restBetweenItemsSeconds) => onChange({ restBetweenItemsSeconds })}
            keyboardType="number-pad"
            placeholder="Ex. 30"
            style={{ flex: 1 }}
          />
        </View>
        <FieldInput
          testID={`${tid}-rest-rounds`}
          label="Récup. R — entre tours (s)"
          value={group.restBetweenRoundsSeconds}
          onChangeText={(restBetweenRoundsSeconds) => onChange({ restBetweenRoundsSeconds })}
          keyboardType="number-pad"
          placeholder="Ex. 180"
        />

        {/* Membres du groupe : BlockCard standard, contexte `inGroup` (sets masqué). */}
        {group.items.map((member, m) => (
          <BlockCard
            key={member.key}
            block={member}
            index={m}
            total={group.items.length}
            testIDPrefix={`${tid}-block-${m}`}
            label={superset ? `A${m + 1}` : `Exercice ${m + 1}`}
            inGroup
            onChange={(patch) => onMemberChange(m, patch)}
            onMoveUp={() => onMemberMoveUp(m)}
            onMoveDown={() => onMemberMoveDown(m)}
            onRemove={() => onMemberRemove(m)}
            onUngroup={() => onMemberUngroup(m)}
          />
        ))}

        <Button
          testID={`${tid}-add-member`}
          variant="secondary"
          fullWidth
          leftIcon={<Feather name="plus" size={16} color={colors.textPrimary} />}
          onPress={onAddMember}
        >
          Ajouter un exercice au groupe
        </Button>

        <FieldInput
          testID={`${tid}-notes`}
          label="Notes du groupe (optionnel)"
          value={group.notes}
          onChangeText={(notes) => onChange({ notes })}
          placeholder="Consigne d'exécution du circuit…"
          multiline
        />
      </View>
    </Card>
  );
}

/** Sélecteur du type de bloc (TLX-053) : chips déduits de `BLOCK_TYPE_SPECS`. */
function BlockTypeSelector({
  tid,
  value,
  onChange,
}: {
  tid: string;
  value: BlockType;
  onChange: (type: BlockType) => void;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        Type de bloc
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {BLOCK_TYPE_SPECS.map((spec) => (
          <Chip
            key={spec.type}
            testID={`${tid}-type-${spec.type}`}
            selected={value === spec.type}
            onPress={() => onChange(spec.type)}
          >
            {spec.label}
          </Chip>
        ))}
      </View>
    </View>
  );
}

/**
 * Éditeur des `params` propres au type sélectionné (TLX-054→061). Rendu uniquement si le
 * type courant déclare des `paramFields` ; sinon `null` (types génériques sans params).
 */
function BlockParamsEditor({
  tid,
  block,
  onChange,
}: {
  tid: string;
  block: EditableBlock;
  onChange: (patch: Partial<EditableBlock>) => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const spec = specForType(block.type);
  if (!spec.paramFields?.length) return null;
  return (
    <View testID={`${tid}-params`} style={{ gap: spacing[3] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Paramètres — {spec.label}
      </Text>
      {spec.paramFields.map((field) =>
        field.kind === 'select' ? (
          <View key={field.key} style={{ gap: spacing[2] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {field.required ? `${field.label} (requis)` : field.label}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {field.options?.map((opt) => (
                <Chip
                  key={opt.value}
                  testID={`${tid}-param-${field.key}-${opt.value}`}
                  selected={block.params[field.key] === opt.value}
                  onPress={() => onChange({ params: { ...block.params, [field.key]: opt.value } })}
                >
                  {opt.label}
                </Chip>
              ))}
            </View>
          </View>
        ) : (
          <FieldInput
            key={field.key}
            testID={`${tid}-param-${field.key}`}
            label={field.required ? `${field.label} (requis)` : field.label}
            value={block.params[field.key] ?? ''}
            onChangeText={(v) => onChange({ params: { ...block.params, [field.key]: v } })}
            keyboardType={
              field.kind === 'number' ? 'numeric' : field.kind === 'text' ? 'default' : 'number-pad'
            }
            placeholder={field.placeholder}
          />
        ),
      )}
    </View>
  );
}

/**
 * Champ libellé + saisie, calé sur les tokens du design system. Local au constructeur
 * (le composant `Input` du DS n'expose pas `multiline` ni `style` direct).
 */
function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  testID,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'numeric';
  multiline?: boolean;
  testID?: string;
  style?: object;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View style={[{ gap: spacing[2] }, style]}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        style={{
          minHeight: multiline ? 72 : 48,
          paddingHorizontal: spacing[4],
          paddingTop: multiline ? spacing[3] : 0,
          paddingVertical: multiline ? spacing[3] : 0,
          textAlignVertical: multiline ? 'top' : 'center',
          borderRadius: radius.sm,
          borderWidth: borderWidth.hairline,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
        }}
      />
    </View>
  );
}

/** Bouton-icône compact (contrôles d'ordre / suppression de bloc). */
function IconButton({
  icon,
  label,
  onPress,
  disabled,
  tone,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'danger';
  testID?: string;
}) {
  const { colors, spacing, radius, opacity } = useTheme();
  const color = tone === 'danger' ? colors.danger : colors.textSecondary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={spacing[2]}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: pressed ? colors.surfaceSunken : 'transparent',
        opacity: disabled ? opacity.disabled : 1,
      })}
    >
      <Feather name={icon} size={18} color={color} />
    </Pressable>
  );
}
