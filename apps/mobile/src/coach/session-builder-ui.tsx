import { LoadUnit, type Exercise } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Card, Chip } from '../components/ui';

/**
 * Couche UI partagée du constructeur de séance (C-05 — TLX-052). Le backend TLX-050
 * accepte un document `ExercisesDoc` **générique** (schéma exercises v1, cf. TX-DATA-006) :
 * blocs plats `{ name, order, sets?, reps?, durationSeconds?, restSeconds?, load?, notes? }`.
 * Cet éditeur reste donc générique et calé sur ce contrat. Les éditeurs **typés** par
 * discipline (haies, sauts…) supposent un schéma v2 typé → ADR-18 à valider avant de coder
 * (TLX-053→061).
 */

/** Bloc en cours d'édition : tous les champs numériques sont des chaînes (saisie libre). */
export interface EditableBlock {
  /** Clé stable côté client pour le rendu de liste (préservée au réordonnancement). */
  key: string;
  name: string;
  sets: string;
  reps: string;
  durationSeconds: string;
  restSeconds: string;
  loadValue: string;
  loadUnit: LoadUnit | null;
  notes: string;
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

/** Nouveau bloc vide. */
export function makeEmptyBlock(): EditableBlock {
  return {
    key: nextBlockKey(),
    name: '',
    sets: '',
    reps: '',
    durationSeconds: '',
    restSeconds: '',
    loadValue: '',
    loadUnit: null,
    notes: '',
  };
}

/** Hydrate les blocs éditables depuis un `ExercisesDoc` existant (mode édition). */
export function blocksFromExercises(items: Exercise[]): EditableBlock[] {
  return [...items]
    .sort((a, b) => a.order - b.order)
    .map((ex) => ({
      key: nextBlockKey(),
      name: ex.name,
      sets: ex.sets != null ? String(ex.sets) : '',
      reps: ex.reps != null ? String(ex.reps) : '',
      durationSeconds: ex.durationSeconds != null ? String(ex.durationSeconds) : '',
      restSeconds: ex.restSeconds != null ? String(ex.restSeconds) : '',
      loadValue: ex.load != null ? String(ex.load.value) : '',
      loadUnit: ex.load?.unit ?? null,
      notes: ex.notes ?? '',
    }));
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
  return exercise;
}

/** Au moins un bloc nommé. Renvoie l'index du premier bloc sans nom, ou -1 si tout est valide. */
export function firstUnnamedBlockIndex(blocks: EditableBlock[]): number {
  return blocks.findIndex((b) => b.name.trim() === '');
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
