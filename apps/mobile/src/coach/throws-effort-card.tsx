import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { BlockType } from '@talent-x/api-client';
import { Chip, Stepper } from '../components/ui';
import {
  isEditableGroup,
  makeBlock,
  makeSeriesGroup,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';
import {
  THROWS_PRESETS,
  THROW_RECORDS,
  regulationImplementKg,
  targetDistanceFromRecord,
} from './assistant-presets';
import {
  CanvasKpiHeader,
  CellInput,
  EffortCanvasShell,
  EffortRowFrame,
  EffortTable,
  FieldLabel,
  InfoNote,
  InlineNumberInput,
  PresetPicker,
  SegmentedControl,
  SeriesCardFrame,
} from './effort-card-shared';

/**
 * Canvas Lancers (ADR-39, TLX-167). 1 carte = 1 série, 1 ligne = 1 atelier (lancers technique
 * vs complets). Le poids d'engin est dérivé de la discipline + catégorie (réglementaire) mais
 * reste éditable ; la cible (% record / absolu) et le style (poids) sont partagés par la série.
 * Pas d'échauffement/RAC encadrants. Zéro changement de contrat.
 */

// ---------- Référence données ----------------------------------------------------------------

const DISCIPLINES = [
  { value: 'shot', label: 'Poids' },
  { value: 'discus', label: 'Disque' },
  { value: 'javelin', label: 'Javelot' },
  { value: 'hammer', label: 'Marteau' },
];

const SEXES = [
  { value: 'M', label: 'Hommes' },
  { value: 'F', label: 'Femmes' },
];

const IMPLEMENT_STATES = [
  { value: 'regulation', label: 'Réglementaire' },
  { value: 'heavy', label: 'Lourd' },
  { value: 'light', label: 'Léger' },
];

const STYLES = [
  { value: 'glide', label: 'Translation' },
  { value: 'spin', label: 'Rotation' },
];

const TARGET_MODES = [
  { value: 'percent_record', label: '% record' },
  { value: 'absolute', label: 'Cible (m)' },
];

// ---------- Helpers -------------------------------------------------------------------------

function serieProps(group: EditableGroup) {
  const first = group.items[0];
  return {
    discipline: first?.params.discipline ?? 'shot',
    sex: (first?.params.sex ?? 'M') as 'M' | 'F',
    implementState: first?.params.implementState ?? 'regulation',
    style: first?.params.style ?? 'spin',
    targetMode: first?.params.targetMode ?? 'percent_record',
    implementKg: first?.params.implementKg ?? '',
    rounds: Math.max(1, Number(group.rounds) || 1),
    restR: Math.max(0, Number(group.restBetweenRoundsSeconds) || 0),
  };
}

function disciplineLabel(value: string): string {
  return DISCIPLINES.find((d) => d.value === value)?.label ?? value;
}

function serieSummary(group: EditableGroup): string {
  const { discipline, implementKg, rounds } = serieProps(group);
  const tech =
    group.items.reduce((a, b) => a + (Number(b.params.techniqueThrows) || 0), 0) * rounds;
  const full = group.items.reduce((a, b) => a + (Number(b.params.fullThrows) || 0), 0) * rounds;
  const parts = [disciplineLabel(discipline)];
  if (implementKg) parts.push(`${implementKg} kg`);
  parts.push(`${tech} tech.`);
  parts.push(`${full} complets`);
  return parts.join(' · ');
}

function totals(series: EditableGroup[]) {
  let tech = 0;
  let full = 0;
  for (const g of series) {
    const rounds = Math.max(1, Number(g.rounds) || 1);
    for (const b of g.items) {
      tech += (Number(b.params.techniqueThrows) || 0) * rounds;
      full += (Number(b.params.fullThrows) || 0) * rounds;
    }
  }
  return { tech, full };
}

function estMinutes(series: EditableGroup[]): number {
  const { tech, full } = totals(series);
  // ≈45 s par lancer technique, ≈90 s par lancer complet (mise en place + récup), + 15 min mise en train.
  return Math.round((tech * 45 + full * 90) / 60) + 15;
}

/** Atelier de lancers avec les propriétés partagées de la série. */
function makeThrowBlock(opts: {
  discipline: string;
  sex: 'M' | 'F';
  implementState: string;
  style: string;
  targetMode: string;
  implementKg?: string;
  techniqueThrows?: number;
  fullThrows?: number;
}): EditableBlock {
  const kg =
    opts.implementState === 'regulation'
      ? regulationImplementKg(opts.discipline, opts.sex)
      : undefined;
  const params: Record<string, string> = {
    discipline: opts.discipline,
    sex: opts.sex,
    implementState: opts.implementState,
    style: opts.style,
    targetMode: opts.targetMode,
    implementKg: kg != null ? String(kg) : (opts.implementKg ?? ''),
    techniqueThrows: String(opts.techniqueThrows ?? 6),
    fullThrows: String(opts.fullThrows ?? 4),
  };
  return makeBlock({
    type: BlockType.throws,
    name: disciplineLabel(opts.discipline),
    params,
  });
}

/** Clé du modèle dont la série amorcée correspond (match par nom) — pré-sélection du picker. */
function matchPresetKey(group: EditableGroup): string {
  for (const p of THROWS_PRESETS) {
    const g = p.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (g && g.name === group.name) return p.key;
  }
  return '';
}

function defaultThrowSeries(): EditableGroup {
  // Série ajoutée = 1er preset → modèle sélectionné par défaut + table pré-remplie.
  const g = THROWS_PRESETS[0]?.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
  if (g) return g;
  return makeSeriesGroup({
    name: 'Série de lancers',
    rounds: '1',
    items: [
      makeThrowBlock({
        discipline: 'shot',
        sex: 'M',
        implementState: 'regulation',
        style: 'spin',
        targetMode: 'percent_record',
        techniqueThrows: 6,
        fullThrows: 4,
      }),
    ],
  });
}

// ---------- Canvas principal ----------------------------------------------------------------

export function ThrowsEffortCanvas({
  nodes,
  onChange,
  embedded = false,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
  embedded?: boolean;
}) {
  const series = nodes.filter((n) => isEditableGroup(n)) as EditableGroup[];

  function commit(newSeries: EditableGroup[]) {
    onChange(newSeries);
  }

  function patchGroup(gi: number, patch: Partial<EditableGroup>) {
    commit(series.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }

  /** Met à jour un param partagé. Recalcule le poids réglementaire si discipline/catégorie/état changent. */
  function patchSerieParam(gi: number, paramPatch: Record<string, string>) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        return {
          ...g,
          items: g.items.map((b) => {
            const params = { ...b.params, ...paramPatch };
            const touchesImplement =
              'discipline' in paramPatch || 'sex' in paramPatch || 'implementState' in paramPatch;
            if (touchesImplement && params.implementState === 'regulation') {
              const kg = regulationImplementKg(params.discipline, params.sex as 'M' | 'F');
              if (kg != null) params.implementKg = String(kg);
            }
            const name = 'discipline' in paramPatch ? disciplineLabel(params.discipline) : b.name;
            return { ...b, name, params };
          }),
        };
      }),
    );
  }

  function patchAtelier(gi: number, bi: number, paramPatch: Record<string, string>) {
    commit(
      series.map((g, i) =>
        i === gi
          ? {
              ...g,
              items: g.items.map((b, j) =>
                j === bi ? { ...b, params: { ...b.params, ...paramPatch } } : b,
              ),
            }
          : g,
      ),
    );
  }

  function addAtelier(gi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const p = serieProps(g);
        return {
          ...g,
          items: [
            ...g.items,
            makeThrowBlock({
              discipline: p.discipline,
              sex: p.sex,
              implementState: p.implementState,
              style: p.style,
              targetMode: p.targetMode,
              implementKg: p.implementKg,
              techniqueThrows: 4,
              fullThrows: 4,
            }),
          ],
        };
      }),
    );
  }

  function removeAtelier(gi: number, bi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const remaining = g.items.filter((_, j) => j !== bi);
        return { ...g, items: remaining.length > 0 ? remaining : g.items };
      }),
    );
  }

  function addSerie() {
    commit([...series, defaultThrowSeries()]);
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
    const preset = THROWS_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const builtGroup = preset.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (!builtGroup) return;
    commit(series.map((g, i) => (i === gi ? { ...builtGroup, key: g.key } : g)));
  }

  const { tech, full } = totals(series);

  return (
    <EffortCanvasShell
      testID="throws-effort-canvas"
      header={
        embedded ? undefined : (
          <CanvasKpiHeader
            testID="throws-canvas-summary"
            title={`${tech} lancers technique · ${full} complets`}
            subtitle={`· ~${estMinutes(series)} min`}
          />
        )
      }
      onAddSeries={addSerie}
      addSeriesTestID="throws-add-series"
    >
      {series.map((group, gi) => (
        <ThrowsSeriesCard
          key={group.key}
          group={group}
          index={gi}
          total={series.length}
          onPatchGroup={(patch) => patchGroup(gi, patch)}
          onPatchSerieParam={(patch) => patchSerieParam(gi, patch)}
          onPatchAtelier={(bi, patch) => patchAtelier(gi, bi, patch)}
          onAddAtelier={() => addAtelier(gi)}
          onRemoveAtelier={(bi) => removeAtelier(gi, bi)}
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

function ThrowsSeriesCard({
  group,
  index,
  total,
  onPatchGroup,
  onPatchSerieParam,
  onPatchAtelier,
  onAddAtelier,
  onRemoveAtelier,
  onApplyPreset,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  group: EditableGroup;
  index: number;
  total: number;
  onPatchGroup: (patch: Partial<EditableGroup>) => void;
  onPatchSerieParam: (patch: Record<string, string>) => void;
  onPatchAtelier: (bi: number, patch: Record<string, string>) => void;
  onAddAtelier: () => void;
  onRemoveAtelier: (bi: number) => void;
  onApplyPreset: (key: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [selectedPresetKey, setSelectedPresetKey] = useState(() => matchPresetKey(group));
  const { spacing } = useTheme();
  const tid = `series-card-${index}`;
  const { discipline, sex, implementState, style, targetMode, rounds } = serieProps(group);
  const targetValue =
    targetMode === 'absolute'
      ? (group.items[0]?.params.targetMeters ?? '')
      : (group.items[0]?.params.targetPercent ?? '');
  const targetDistance =
    targetMode === 'percent_record'
      ? targetDistanceFromRecord(THROW_RECORDS, discipline, Number(targetValue) || 0)
      : undefined;

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
      {/* Modèle : pleine largeur (l'ouverture du sélecteur ne décale plus « Tours »). */}
      <View>
        <FieldLabel>Modèle</FieldLabel>
        <PresetPicker
          testID={`${tid}-preset`}
          presets={THROWS_PRESETS}
          selectedKey={selectedPresetKey}
          onSelect={(key) => {
            setSelectedPresetKey(key);
            onApplyPreset(key);
          }}
        />
      </View>
      <View>
        <FieldLabel>Tours</FieldLabel>
        <Stepper
          testID={`${tid}-rounds`}
          value={rounds}
          min={1}
          max={10}
          onValueChange={(v) => onPatchGroup({ rounds: String(v) })}
          accessibilityLabel="Nombre de tours"
        />
      </View>

      {/* Discipline */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Discipline</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {DISCIPLINES.map((d) => (
            <Chip
              key={d.value}
              testID={`${tid}-disc-${d.value}`}
              selected={discipline === d.value}
              onPress={() => onPatchSerieParam({ discipline: d.value })}
            >
              {d.label}
            </Chip>
          ))}
        </View>
      </View>

      {/* Catégorie + état de l'engin */}
      <View style={{ flexDirection: 'row', gap: spacing[4], flexWrap: 'wrap' }}>
        <View style={{ gap: spacing[2] }}>
          <FieldLabel>Catégorie</FieldLabel>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {SEXES.map((s) => (
              <Chip
                key={s.value}
                testID={`${tid}-sex-${s.value}`}
                selected={sex === s.value}
                onPress={() => onPatchSerieParam({ sex: s.value })}
              >
                {s.label}
              </Chip>
            ))}
          </View>
        </View>
        <View style={{ gap: spacing[2] }}>
          <FieldLabel>État de l'engin</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {IMPLEMENT_STATES.map((s) => (
              <Chip
                key={s.value}
                testID={`${tid}-state-${s.value}`}
                selected={implementState === s.value}
                onPress={() => onPatchSerieParam({ implementState: s.value })}
              >
                {s.label}
              </Chip>
            ))}
          </View>
        </View>
      </View>

      {/* Style (poids uniquement) */}
      {discipline === 'shot' && (
        <View style={{ gap: spacing[2] }}>
          <FieldLabel>Style (poids)</FieldLabel>
          <SegmentedControl
            testIDPrefix={`${tid}-style`}
            options={STYLES}
            selected={style}
            onSelect={(v) => onPatchSerieParam({ style: v })}
          />
        </View>
      )}

      {/* Tableau des ateliers */}
      <EffortTable
        title="Ateliers de la série"
        onAddRow={onAddAtelier}
        addRowTestID={`${tid}-add-atelier`}
        columns={[{ label: 'Technique' }, { label: 'Complets' }, { label: 'Poids' }]}
      >
        {group.items.map((block, bi) => (
          <ThrowRow
            key={block.key}
            block={block}
            index={bi}
            canDelete={group.items.length > 1}
            onPatch={(patch) => onPatchAtelier(bi, patch)}
            onDelete={() => onRemoveAtelier(bi)}
            testIDPrefix={`${tid}-atelier-${bi}`}
          />
        ))}
      </EffortTable>

      {/* Cible */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Cible de performance</FieldLabel>
        <SegmentedControl
          testIDPrefix={`${tid}-tmode`}
          options={TARGET_MODES}
          selected={targetMode}
          onSelect={(v) => onPatchSerieParam({ targetMode: v })}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <InlineNumberInput
              testID={`${tid}-target`}
              value={targetValue}
              onChangeText={(t) =>
                onPatchSerieParam(
                  targetMode === 'absolute' ? { targetMeters: t } : { targetPercent: t },
                )
              }
              placeholder={targetMode === 'absolute' ? '18.50' : '92'}
              unit={targetMode === 'absolute' ? 'm' : '%'}
            />
          </View>
        </View>
        <InfoNote>
          {targetMode === 'absolute'
            ? 'Distance cible absolue, commune à tous les athlètes.'
            : `Cible individualisée · % du record de chaque athlète sur la discipline${
                targetDistance != null ? ` (≈ ${targetDistance} m sur la référence du module)` : ''
              }.`}
        </InfoNote>
      </View>
    </SeriesCardFrame>
  );
}

// ---------- Rangée atelier ------------------------------------------------------------------

function ThrowRow({
  block,
  index,
  canDelete,
  onPatch,
  onDelete,
  testIDPrefix,
}: {
  block: EditableBlock;
  index: number;
  canDelete: boolean;
  onPatch: (patch: Record<string, string>) => void;
  onDelete: () => void;
  testIDPrefix: string;
}) {
  return (
    <EffortRowFrame
      testID={testIDPrefix}
      index={index}
      canDelete={canDelete}
      onDelete={onDelete}
      deleteLabel="Supprimer cet atelier"
    >
      <CellInput
        testID={`${testIDPrefix}-tech`}
        value={block.params.techniqueThrows ?? ''}
        onChangeText={(t) => onPatch({ techniqueThrows: t })}
      />
      <CellInput
        testID={`${testIDPrefix}-full`}
        value={block.params.fullThrows ?? ''}
        onChangeText={(t) => onPatch({ fullThrows: t })}
      />
      <CellInput
        testID={`${testIDPrefix}-kg`}
        value={block.params.implementKg ?? ''}
        onChangeText={(t) => onPatch({ implementKg: t })}
        unit="kg"
        decimal
      />
    </EffortRowFrame>
  );
}
