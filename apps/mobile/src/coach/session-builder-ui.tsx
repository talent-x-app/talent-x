import { BlockType, LoadUnit, type Exercise } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Card, Chip } from '../components/ui';

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

/** Champ de `params` propre à un type de bloc (saisie numérique ou choix discret). */
export interface BlockParamField {
  key: string;
  label: string;
  placeholder?: string;
  /**
   * `int` (défaut) / `number` (décimal autorisé, ex. espacement en m) → saisie numérique ;
   * `select` → choix parmi `options` (param libre en chaîne, ex. discipline, cf. ADR-25).
   */
  kind?: 'int' | 'number' | 'select';
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
  // TLX-060 — Musculation : séries × reps × charge = base v1 générique (aucun `params`) ;
  // `strength` ne fait que tagger le bloc (cf. ADR-18).
  { type: BlockType.strength, label: 'Musculation' },
  {
    type: BlockType.interval,
    label: 'Intervalles',
    // TLX-054 — Fractionné / Intervalles. `distanceMeters` (par répétition) dérive l'épreuve
    // chronométrée → requis pour le suivi de progression (TLX-91).
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
    ],
  },
  {
    type: BlockType.sprint,
    label: 'Sprints',
    // TLX-055 — Répétitions de vitesse / Sprints : distances, répétitions, récupération.
    // `distanceMeters` dérive l'épreuve chronométrée → requis pour le suivi (TLX-91).
    paramFields: [
      { key: 'reps', label: 'Répétitions (nombre de sprints)', placeholder: 'Ex. 8' },
      { key: 'distanceMeters', label: 'Distance (m)', placeholder: 'Ex. 60', required: true },
      { key: 'recoverySeconds', label: 'Récupération (s)', placeholder: 'Ex. 180' },
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

/** Hydrate les blocs éditables depuis un `ExercisesDoc` existant (mode édition). */
export function blocksFromExercises(items: Exercise[]): EditableBlock[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((ex) => {
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
    });
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

/** Sérialise un bloc éditable en `Exercise` du contrat (order injecté par l'appelant). */
export function blockToExercise(block: EditableBlock, order: number): Exercise {
  const loadValue = toPositiveNumber(block.loadValue);
  const exercise: Exercise = { name: block.name.trim(), order };
  // `type` n'est posé que pour une discipline (un bloc `custom` reste byte-identique au v1).
  if (block.type !== BlockType.custom) exercise.type = block.type;
  const sets = toPositiveInt(block.sets);
  const reps = toPositiveInt(block.reps);
  const durationSeconds = toPositiveInt(block.durationSeconds);
  const restSeconds = toPositiveInt(block.restSeconds);
  if (sets != null) exercise.sets = sets;
  if (reps != null) exercise.reps = reps;
  if (durationSeconds != null) exercise.durationSeconds = durationSeconds;
  if (restSeconds != null) exercise.restSeconds = restSeconds;
  // La charge n'est attachée que si une valeur ET une unité sont renseignées (contrat `Load`).
  if (loadValue != null && block.loadUnit != null) {
    exercise.load = { value: loadValue, unit: block.loadUnit };
  }
  const notes = block.notes.trim();
  if (notes !== '') exercise.notes = notes;
  // `params` propres au type : champs parsés, attachés seulement si au moins un est rempli.
  // Les champs `select` stockent une chaîne (valeur d'option), les autres un nombre positif.
  const paramFields = specForType(block.type).paramFields;
  if (paramFields?.length) {
    const params: Record<string, number | string> = {};
    paramFields.forEach((f) => {
      if (f.kind === 'select') {
        const raw = (block.params[f.key] ?? '').trim();
        if (raw !== '' && f.options?.some((o) => o.value === raw)) params[f.key] = raw;
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

/** Au moins un bloc nommé. Renvoie l'index du premier bloc sans nom, ou -1 si tout est valide. */
export function firstUnnamedBlockIndex(blocks: EditableBlock[]): number {
  return blocks.findIndex((b) => b.name.trim() === '');
}

/**
 * Premier bloc dont un `param` **requis** (TLX-91) manque ou est invalide — `null` si tout
 * est bon. Garantit qu'un bloc typé dérivant une épreuve (sprint/haies/course/intervalle →
 * distance, lancer → engin, vertical → discipline) porte la donnée sans laquelle la perf
 * n'apparaîtrait jamais en progression. Mêmes règles de parsing que `blockToExercise` et que
 * `record-detection.ts` (numérique strictement positif ; `select` = option valide).
 */
export function firstBlockMissingRequiredParam(
  blocks: EditableBlock[],
): { index: number; field: BlockParamField } | null {
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    for (const field of specForType(block.type).paramFields ?? []) {
      if (!field.required) continue;
      const raw = (block.params[field.key] ?? '').trim();
      if (field.kind === 'select') {
        if (raw === '' || !field.options?.some((o) => o.value === raw)) return { index, field };
        continue;
      }
      const n = field.kind === 'number' ? toPositiveNumber(raw) : toPositiveInt(raw);
      if (n == null || n <= 0) return { index, field };
    }
  }
  return null;
}

/** Carte d'édition d'un bloc générique : nom, séries/reps, durée/repos, charge, notes. */
export function BlockCard({
  block,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  block: EditableBlock;
  index: number;
  total: number;
  onChange: (patch: Partial<EditableBlock>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { colors, typography, spacing } = useTheme();

  return (
    <Card testID={`block-${index}`}>
      <View style={{ gap: spacing[3] }}>
        {/* En-tête de bloc : numéro + contrôles d'ordre / suppression. */}
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
            Bloc {index + 1}
          </Text>
          <IconButton
            testID={`block-${index}-up`}
            icon="arrow-up"
            label="Monter le bloc"
            disabled={index === 0}
            onPress={onMoveUp}
          />
          <IconButton
            testID={`block-${index}-down`}
            icon="arrow-down"
            label="Descendre le bloc"
            disabled={index === total - 1}
            onPress={onMoveDown}
          />
          <IconButton
            testID={`block-${index}-remove`}
            icon="trash-2"
            label="Supprimer le bloc"
            tone="danger"
            onPress={onRemove}
          />
        </View>

        <FieldInput
          testID={`block-${index}-name`}
          label="Nom de l'exercice"
          value={block.name}
          onChangeText={(name) => onChange({ name })}
          placeholder="Ex. Squat arrière, 60m départ…"
        />

        <BlockTypeSelector
          index={index}
          value={block.type}
          onChange={(type) => onChange({ type })}
        />

        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <FieldInput
            testID={`block-${index}-sets`}
            label="Séries"
            value={block.sets}
            onChangeText={(sets) => onChange({ sets })}
            keyboardType="number-pad"
            placeholder="—"
            style={{ flex: 1 }}
          />
          <FieldInput
            testID={`block-${index}-reps`}
            label="Répétitions"
            value={block.reps}
            onChangeText={(reps) => onChange({ reps })}
            keyboardType="number-pad"
            placeholder="—"
            style={{ flex: 1 }}
          />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <FieldInput
            testID={`block-${index}-duration`}
            label="Durée (s)"
            value={block.durationSeconds}
            onChangeText={(durationSeconds) => onChange({ durationSeconds })}
            keyboardType="number-pad"
            placeholder="—"
            style={{ flex: 1 }}
          />
          <FieldInput
            testID={`block-${index}-rest`}
            label="Repos (s)"
            value={block.restSeconds}
            onChangeText={(restSeconds) => onChange({ restSeconds })}
            keyboardType="number-pad"
            placeholder="—"
            style={{ flex: 1 }}
          />
        </View>

        {/* Charge : valeur + unité. Attachée à la séance seulement si les deux sont posées. */}
        <View style={{ gap: spacing[2] }}>
          <FieldInput
            testID={`block-${index}-load`}
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
                testID={`block-${index}-unit-${unit}`}
                selected={block.loadUnit === unit}
                onPress={() => onChange({ loadUnit: block.loadUnit === unit ? null : unit })}
              >
                {LOAD_UNIT_LABELS[unit]}
              </Chip>
            ))}
          </View>
        </View>

        <BlockParamsEditor index={index} block={block} onChange={onChange} />

        <FieldInput
          testID={`block-${index}-notes`}
          label="Notes (optionnel)"
          value={block.notes}
          onChangeText={(notes) => onChange({ notes })}
          placeholder="Consignes, tempo, intention…"
          multiline
        />
      </View>
    </Card>
  );
}

/** Sélecteur du type de bloc (TLX-053) : chips déduits de `BLOCK_TYPE_SPECS`. */
function BlockTypeSelector({
  index,
  value,
  onChange,
}: {
  index: number;
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
            testID={`block-${index}-type-${spec.type}`}
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
  index,
  block,
  onChange,
}: {
  index: number;
  block: EditableBlock;
  onChange: (patch: Partial<EditableBlock>) => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const spec = specForType(block.type);
  if (!spec.paramFields?.length) return null;
  return (
    <View testID={`block-${index}-params`} style={{ gap: spacing[3] }}>
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
                  testID={`block-${index}-param-${field.key}-${opt.value}`}
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
            testID={`block-${index}-param-${field.key}`}
            label={field.required ? `${field.label} (requis)` : field.label}
            value={block.params[field.key] ?? ''}
            onChangeText={(v) => onChange({ params: { ...block.params, [field.key]: v } })}
            keyboardType={field.kind === 'number' ? 'numeric' : 'number-pad'}
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
