import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@talent-x/design-tokens';
import { BlockType } from '@talent-x/api-client';
import { Stepper } from '../components/ui';
import {
  isEditableGroup,
  makeBlock,
  makeSeriesGroup,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';
import {
  CanvasKpiHeader,
  CellInput,
  EffortCanvasShell,
  FieldLabel,
  InlineNumberInput,
  PresetPicker,
  SeriesCardFrame,
} from './effort-card-shared';

/**
 * Canvas d'effort **générique** (ADR-52, TLX-193) — la série « Libre » suit exactement la même
 * grammaire que les cartes par discipline : un sélecteur **« Type d'effort »** (catalogue
 * générique) en tête, un tableau d'exercices, « Tours » + récup R. Remplace l'éditeur de blocs
 * brut (`GenericBlocksEditor`) dans le chemin de création.
 *
 * Contrainte de round-trip (ADR-52 §D3) : les feuilles sont de type **`custom`** (jamais ré-aspiré
 * par `inferDiscipline` → la série reste « libre »), et leurs valeurs vivent dans les **champs de
 * base** (`name`/`reps`/`durationSeconds`/`restSeconds`/`notes`) — `custom` n'ayant aucun
 * `paramField`, tout `params` serait perdu à l'hydratation. Le « Type d'effort » est un état local
 * (non persisté), comme `selectedPresetKey` des cartes discipline.
 */

// ---------- Catalogue « Type d'effort » -----------------------------------------------------

/** Un type d'effort générique = un libellé + un constructeur de série (feuilles `custom`). */
interface GenericPreset {
  key: string;
  label: string;
  build: () => EditableGroup;
}

/** Feuille générique : valeurs dans les champs de base (round-trip via `nodesToItems`). */
function genericLeaf(over: {
  name?: string;
  reps?: string;
  durationSeconds?: string;
  restSeconds?: string;
  notes?: string;
}): EditableBlock {
  return makeBlock({
    type: BlockType.custom,
    name: over.name ?? '',
    reps: over.reps ?? '',
    durationSeconds: over.durationSeconds ?? '',
    restSeconds: over.restSeconds ?? '',
    notes: over.notes ?? '',
  });
}

export const GENERIC_PRESETS: GenericPreset[] = [
  {
    key: 'core',
    label: 'Gainage / PPG',
    build: () =>
      makeSeriesGroup({
        name: 'Gainage / PPG',
        rounds: '3',
        restBetweenRoundsSeconds: '60',
        items: [
          genericLeaf({ name: 'Planche', durationSeconds: '45', restSeconds: '15' }),
          genericLeaf({ name: 'Gainage latéral', durationSeconds: '30', restSeconds: '15' }),
        ],
      }),
  },
  {
    key: 'reps',
    label: 'Répétitions',
    build: () =>
      makeSeriesGroup({
        name: 'Répétitions',
        rounds: '3',
        restBetweenRoundsSeconds: '90',
        items: [genericLeaf({ name: 'Exercice', reps: '10', restSeconds: '60' })],
      }),
  },
  {
    key: 'recovery',
    label: 'Récup active',
    build: () =>
      makeSeriesGroup({
        name: 'Récupération active',
        rounds: '1',
        items: [genericLeaf({ name: 'Footing', durationSeconds: '600' })],
      }),
  },
  {
    key: 'free',
    label: 'Libre',
    build: () =>
      makeSeriesGroup({
        name: 'Série libre',
        rounds: '1',
        items: [genericLeaf({})],
      }),
  },
];

/** Série générique par défaut (Gainage / PPG) — un type pré-sélectionné comme les assistants. */
export function defaultGenericSeries(): EditableGroup {
  return GENERIC_PRESETS[0].build();
}

// ---------- Helpers -------------------------------------------------------------------------

function serieProps(group: EditableGroup) {
  return {
    rounds: Math.max(1, Number(group.rounds) || 1),
    restR: Math.max(0, Number(group.restBetweenRoundsSeconds) || 0),
  };
}

function serieSummary(group: EditableGroup): string {
  const { rounds } = serieProps(group);
  const n = group.items.length;
  const named = group.items.find((b) => b.name.trim() !== '')?.name?.trim();
  const head = named ?? `${n} exercice${n > 1 ? 's' : ''}`;
  return rounds > 1 ? `${head} · ${rounds} tours` : head;
}

/** Enveloppe un nœud bare (bloc top-level) en série mono-item — la carte ne manipule que des groupes. */
function asSeries(node: EditableNode): EditableGroup {
  if (isEditableGroup(node)) return node;
  return makeSeriesGroup({
    key: `wrap-${node.key}`,
    name: node.name || 'Série libre',
    items: [node],
  });
}

// ---------- Canvas principal ----------------------------------------------------------------

export function GenericEffortCanvas({
  nodes,
  onChange,
  embedded = false,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
  embedded?: boolean;
}) {
  // Normalise tout en séries (un segment custom peut contenir un bloc bare hydraté).
  const series = nodes.map(asSeries);

  function commit(newSeries: EditableGroup[]) {
    onChange(newSeries);
  }

  function patchGroup(gi: number, patch: Partial<EditableGroup>) {
    commit(series.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }

  function patchExercise(gi: number, bi: number, patch: Partial<EditableBlock>) {
    commit(
      series.map((g, i) =>
        i === gi ? { ...g, items: g.items.map((b, j) => (j === bi ? { ...b, ...patch } : b)) } : g,
      ),
    );
  }

  function addExercise(gi: number) {
    commit(
      series.map((g, i) =>
        i === gi ? { ...g, items: [...g.items, genericLeaf({ name: 'Exercice' })] } : g,
      ),
    );
  }

  function removeExercise(gi: number, bi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const remaining = g.items.filter((_, j) => j !== bi);
        return { ...g, items: remaining.length > 0 ? remaining : g.items };
      }),
    );
  }

  function addSerie() {
    commit([...series, defaultGenericSeries()]);
  }

  function removeSerie(gi: number) {
    if (series.length <= 1) return;
    commit(series.filter((_, i) => i !== gi));
  }

  function moveSerie(gi: number, dir: -1 | 1) {
    const j = gi + dir;
    if (j < 0 || j >= series.length) return;
    const next = [...series];
    [next[gi], next[j]] = [next[j], next[gi]];
    commit(next);
  }

  function applyPreset(gi: number, presetKey: string) {
    const preset = GENERIC_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    commit(series.map((g, i) => (i === gi ? { ...preset.build(), key: g.key } : g)));
  }

  const totalExercises = series.reduce((a, g) => a + g.items.length, 0);

  return (
    <EffortCanvasShell
      testID="generic-effort-canvas"
      header={
        embedded ? undefined : (
          <CanvasKpiHeader
            testID="generic-canvas-summary"
            title={`${totalExercises} exercice${totalExercises > 1 ? 's' : ''}`}
            subtitle="Série libre · composez vos exercices"
          />
        )
      }
      onAddSeries={addSerie}
      addSeriesTestID="generic-add-series"
    >
      {series.map((group, gi) => (
        <GenericSeriesCard
          key={group.key}
          group={group}
          index={gi}
          total={series.length}
          onPatchGroup={(patch) => patchGroup(gi, patch)}
          onPatchExercise={(bi, patch) => patchExercise(gi, bi, patch)}
          onAddExercise={() => addExercise(gi)}
          onRemoveExercise={(bi) => removeExercise(gi, bi)}
          onApplyPreset={(key) => applyPreset(gi, key)}
          onMoveUp={() => moveSerie(gi, -1)}
          onMoveDown={() => moveSerie(gi, 1)}
          onDelete={() => removeSerie(gi)}
        />
      ))}
    </EffortCanvasShell>
  );
}

// ---------- Carte de série ------------------------------------------------------------------

function GenericSeriesCard({
  group,
  index,
  total,
  onPatchGroup,
  onPatchExercise,
  onAddExercise,
  onRemoveExercise,
  onApplyPreset,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  group: EditableGroup;
  index: number;
  total: number;
  onPatchGroup: (patch: Partial<EditableGroup>) => void;
  onPatchExercise: (bi: number, patch: Partial<EditableBlock>) => void;
  onAddExercise: () => void;
  onRemoveExercise: (bi: number) => void;
  onApplyPreset: (key: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const { colors, typography, spacing } = useTheme();
  const tid = `series-card-${index}`;
  const { rounds, restR } = serieProps(group);

  return (
    <SeriesCardFrame
      testID={tid}
      index={index}
      total={total}
      tileText={rounds > 1 ? `×${rounds}` : '◎'}
      kicker={`Série ${index + 1}`}
      summary={serieSummary(group)}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onDelete={onDelete}
    >
      {/* Type d'effort : pleine largeur (parité avec « Modèle » des cartes discipline). */}
      <View>
        <FieldLabel>Type d'effort</FieldLabel>
        <PresetPicker
          testID={`${tid}-kind`}
          presets={GENERIC_PRESETS}
          selectedKey={selectedPresetKey}
          onSelect={(key) => {
            setSelectedPresetKey(key);
            onApplyPreset(key);
          }}
          placeholder="Choisir un type…"
        />
      </View>

      {/* Tours + récup R — deux colonnes égales, côte à côte. */}
      <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <FieldLabel>Tours</FieldLabel>
          <Stepper
            testID={`${tid}-rounds`}
            value={rounds}
            min={1}
            max={20}
            onValueChange={(v) => onPatchGroup({ rounds: String(v) })}
            accessibilityLabel="Nombre de tours"
          />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel>Récup. R</FieldLabel>
          <InlineNumberInput
            testID={`${tid}-restR`}
            value={restR > 0 ? String(restR / 60) : ''}
            onChangeText={(t) => {
              const v = parseFloat(t);
              onPatchGroup({
                restBetweenRoundsSeconds: String(isNaN(v) ? 0 : Math.round(v * 60)),
              });
            }}
            unit="min"
            placeholder="0"
          />
        </View>
      </View>

      {/* Exercices de la série */}
      <View style={{ gap: spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Exercices
          </Text>
          <Pressable
            testID={`${tid}-add-exercise`}
            onPress={onAddExercise}
            accessibilityRole="button"
            accessibilityLabel="Ajouter un exercice"
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
          >
            <Feather name="plus" size={14} color={colors.accentText} />
            <Text
              style={{
                color: colors.accentText,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              ajouter
            </Text>
          </Pressable>
        </View>

        {group.items.map((block, bi) => (
          <GenericExerciseRow
            key={block.key}
            block={block}
            canDelete={group.items.length > 1}
            onPatch={(patch) => onPatchExercise(bi, patch)}
            onDelete={() => onRemoveExercise(bi)}
            testIDPrefix={`${tid}-ex-${bi}`}
          />
        ))}
      </View>
    </SeriesCardFrame>
  );
}

// ---------- Rangée exercice -----------------------------------------------------------------

function GenericExerciseRow({
  block,
  canDelete,
  onPatch,
  onDelete,
  testIDPrefix,
}: {
  block: EditableBlock;
  canDelete: boolean;
  onPatch: (patch: Partial<EditableBlock>) => void;
  onDelete: () => void;
  testIDPrefix: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View
      testID={testIDPrefix}
      style={{
        gap: spacing[2],
        paddingVertical: spacing[2],
        borderTopWidth: borderWidth.hairline,
        borderTopColor: colors.border,
      }}
    >
      {/* Nom de l'exercice (pleine largeur) + suppression. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <TextInput
          testID={`${testIDPrefix}-name`}
          value={block.name}
          onChangeText={(t) => onPatch({ name: t })}
          placeholder="Nom de l'exercice"
          placeholderTextColor={colors.textMuted}
          style={{
            flex: 1,
            height: 38,
            paddingHorizontal: spacing[3],
            borderRadius: radius.sm,
            borderWidth: borderWidth.hairline,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        />
        {canDelete ? (
          <Pressable
            testID={`${testIDPrefix}-del`}
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Supprimer cet exercice"
            hitSlop={8}
            style={{ width: 24, alignItems: 'center' }}
          >
            <Feather name="x" size={15} color={colors.danger} />
          </Pressable>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {/* Reps · Travail (s) · Récup (s) — champs de base, round-trip garanti. */}
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        <View style={{ flex: 1 }}>
          <FieldLabel>Reps</FieldLabel>
          <CellInput
            testID={`${testIDPrefix}-reps`}
            value={block.reps}
            onChangeText={(t) => onPatch({ reps: t })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel>Travail</FieldLabel>
          <CellInput
            testID={`${testIDPrefix}-work`}
            value={block.durationSeconds}
            onChangeText={(t) => onPatch({ durationSeconds: t })}
            unit="s"
          />
        </View>
        <View style={{ flex: 1 }}>
          <FieldLabel>Récup</FieldLabel>
          <CellInput
            testID={`${testIDPrefix}-rec`}
            value={block.restSeconds}
            onChangeText={(t) => onPatch({ restSeconds: t })}
            unit="s"
          />
        </View>
      </View>
    </View>
  );
}
