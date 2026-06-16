import { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { BlockType } from '@talent-x/api-client';
import { Chip, Stepper } from '../components/ui';
import {
  isEditableGroup,
  makeBlock,
  makeSeriesGroup,
  nodesToItems,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';
import { ENDURANCE_PRESETS } from './assistant-presets';
import { formatDistanceVolume, sessionKpis } from '../sessions/session-summary';
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
  formatMinutes,
} from './effort-card-shared';

/**
 * Canvas Demi-fond / Endurance (ADR-39, TLX-167). 1 carte = 1 série (bloc de répétitions),
 * 1 ligne = 1 effort. Spécificité : **double unité** — distance (course continue →
 * `type:"endurance"`) ou durée (intervalle chronométré → `type:"interval"`, ADR-38). Le
 * référentiel d'intensité (% VMA / allure / zone cardio) et le type de récupération sont
 * partagés par la série. Pas d'échauffement/RAC encadrants (l'échauffement footing fait partie
 * des efforts). Zéro changement de contrat.
 */

// ---------- Référence données ----------------------------------------------------------------

const UNITS = [
  { value: 'distance', label: 'Distance' },
  { value: 'duration', label: 'Durée' },
];

const INTENSITY_MODES = [
  { value: 'vma', label: '% VMA' },
  { value: 'pace', label: 'Allure s/km' },
  { value: 'zone', label: 'Zone cardio' },
];

const RECOVERY_TYPES = [
  { value: 'active', label: 'Active' },
  { value: 'passive', label: 'Passive' },
];

/** Param d'intensité actif selon le mode (clé + unité affichée). */
function intensityField(mode: string): { key: string; unit: string; decimal: boolean } {
  if (mode === 'pace') return { key: 'paceSecondsPerKm', unit: 's/km', decimal: false };
  if (mode === 'zone') return { key: 'hrZone', unit: 'z', decimal: false };
  return { key: 'percentVma', unit: '%', decimal: false };
}

// ---------- Helpers -------------------------------------------------------------------------

function unitOf(group: EditableGroup): 'distance' | 'duration' {
  return group.items[0]?.type === BlockType.interval ? 'duration' : 'distance';
}

function serieProps(group: EditableGroup) {
  const first = group.items[0];
  return {
    unit: unitOf(group),
    intensityMode: first?.params.intensityMode ?? 'vma',
    recoveryType: first?.params.recoveryType ?? 'active',
    rounds: Math.max(1, Number(group.rounds) || 1),
    restR: Math.max(0, Number(group.restBetweenRoundsSeconds) || 0),
  };
}

function serieSummary(group: EditableGroup): string {
  const { unit, intensityMode, rounds, restR } = serieProps(group);
  const field = intensityField(intensityMode);
  const desc = group.items
    .map((b) =>
      unit === 'duration'
        ? `${Math.round(Number(b.params.workSeconds) || 0)}s`
        : `${b.params.distanceMeters ?? '?'} m`,
    )
    .join('·');
  const vals = group.items.map((b) => b.params[field.key]).filter(Boolean);
  const intStr = vals.length ? `${vals[0]}${field.unit}` : '';
  const parts = [`${rounds} × (${desc})`];
  if (intStr) parts.push(intStr);
  if (restR > 0) parts.push(`R ${formatMinutes(restR)}`);
  return parts.join(' · ');
}

function estMinutes(series: EditableGroup[]): number {
  let sec = 0;
  for (const g of series) {
    const { unit, rounds, restR } = serieProps(g);
    const effort = g.items.reduce((a, b) => {
      const work =
        unit === 'duration'
          ? Number(b.params.workSeconds) || 0
          : Math.round((Number(b.params.distanceMeters) || 0) / 3.5); // ≈3,5 m/s
      const rec = Number(b.params.recoverySeconds) || 0;
      return a + work + rec;
    }, 0);
    sec += rounds * effort + (rounds - 1) * restR;
  }
  return Math.round(sec / 60);
}

/** Effort d'endurance avec les propriétés partagées de la série. */
function makeEnduranceBlock(opts: {
  unit: 'distance' | 'duration';
  name?: string;
  distanceMeters?: number;
  workSeconds?: number;
  recoverySeconds?: number;
  recoveryType: string;
  intensityMode: string;
  percentVma?: number;
}): EditableBlock {
  const params: Record<string, string> = {
    distanceMeters: String(opts.distanceMeters ?? (opts.unit === 'duration' ? 400 : 2000)),
    recoverySeconds: String(opts.recoverySeconds ?? 60),
    recoveryType: opts.recoveryType,
    intensityMode: opts.intensityMode,
    percentVma: String(opts.percentVma ?? 90),
  };
  if (opts.unit === 'duration') params.workSeconds = String(opts.workSeconds ?? 60);
  return makeBlock({
    type: opts.unit === 'duration' ? BlockType.interval : BlockType.endurance,
    name: opts.name ?? 'Course',
    params,
  });
}

function defaultEnduranceSeries(): EditableGroup {
  return makeSeriesGroup({
    name: 'Série de course',
    rounds: '3',
    restBetweenRoundsSeconds: '0',
    items: [
      makeEnduranceBlock({
        unit: 'distance',
        name: 'Course',
        distanceMeters: 1000,
        recoverySeconds: 120,
        recoveryType: 'active',
        intensityMode: 'vma',
        percentVma: 90,
      }),
    ],
  });
}

// ---------- Canvas principal ----------------------------------------------------------------

export function EnduranceEffortCanvas({
  nodes,
  onChange,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
}) {
  const series = nodes.filter((n) => isEditableGroup(n)) as EditableGroup[];

  function commit(newSeries: EditableGroup[]) {
    onChange(newSeries);
  }

  function patchGroup(gi: number, patch: Partial<EditableGroup>) {
    commit(series.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }

  function patchSerieParam(gi: number, paramPatch: Record<string, string>) {
    commit(
      series.map((g, i) =>
        i === gi
          ? { ...g, items: g.items.map((b) => ({ ...b, params: { ...b.params, ...paramPatch } })) }
          : g,
      ),
    );
  }

  /** Bascule l'unité de la série : remappe le type de chaque effort (endurance ↔ interval). */
  function setUnit(gi: number, unit: 'distance' | 'duration') {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        return {
          ...g,
          items: g.items.map((b) => {
            const params = { ...b.params };
            if (unit === 'duration' && !params.workSeconds) params.workSeconds = '60';
            return {
              ...b,
              type: unit === 'duration' ? BlockType.interval : BlockType.endurance,
              params,
            };
          }),
        };
      }),
    );
  }

  function patchEffort(gi: number, bi: number, paramPatch: Record<string, string>) {
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

  function addEffort(gi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const p = serieProps(g);
        const last = g.items[g.items.length - 1];
        return {
          ...g,
          items: [
            ...g.items,
            makeEnduranceBlock({
              unit: p.unit,
              distanceMeters: Number(last?.params.distanceMeters) || 1000,
              workSeconds: Number(last?.params.workSeconds) || 60,
              recoverySeconds: Number(last?.params.recoverySeconds) || 60,
              recoveryType: p.recoveryType,
              intensityMode: p.intensityMode,
              percentVma: Number(last?.params.percentVma) || 90,
            }),
          ],
        };
      }),
    );
  }

  function removeEffort(gi: number, bi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const remaining = g.items.filter((_, j) => j !== bi);
        return { ...g, items: remaining.length > 0 ? remaining : g.items };
      }),
    );
  }

  function addSerie() {
    commit([...series, defaultEnduranceSeries()]);
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
    const preset = ENDURANCE_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const builtGroup = preset.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (!builtGroup) return;
    commit(series.map((g, i) => (i === gi ? { ...builtGroup, key: g.key } : g)));
  }

  const kpis = sessionKpis(nodesToItems(series));
  const volStr = formatDistanceVolume(kpis.distanceMeters) ?? '0 m';

  return (
    <EffortCanvasShell
      testID="endurance-effort-canvas"
      header={
        <CanvasKpiHeader
          testID="endurance-canvas-summary"
          title={`Volume : ${volStr}`}
          subtitle={`· ${kpis.efforts} efforts · ~${estMinutes(series)} min`}
        />
      }
      onAddSeries={addSerie}
      addSeriesTestID="endurance-add-series"
    >
      {series.map((group, gi) => (
        <EnduranceSeriesCard
          key={group.key}
          group={group}
          index={gi}
          total={series.length}
          onPatchGroup={(patch) => patchGroup(gi, patch)}
          onPatchSerieParam={(patch) => patchSerieParam(gi, patch)}
          onSetUnit={(u) => setUnit(gi, u)}
          onPatchEffort={(bi, patch) => patchEffort(gi, bi, patch)}
          onAddEffort={() => addEffort(gi)}
          onRemoveEffort={(bi) => removeEffort(gi, bi)}
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

function EnduranceSeriesCard({
  group,
  index,
  total,
  onPatchGroup,
  onPatchSerieParam,
  onSetUnit,
  onPatchEffort,
  onAddEffort,
  onRemoveEffort,
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
  onSetUnit: (u: 'distance' | 'duration') => void;
  onPatchEffort: (bi: number, patch: Record<string, string>) => void;
  onAddEffort: () => void;
  onRemoveEffort: (bi: number) => void;
  onApplyPreset: (key: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const { spacing } = useTheme();
  const tid = `series-card-${index}`;
  const { unit, intensityMode, recoveryType, rounds, restR } = serieProps(group);
  const field = intensityField(intensityMode);

  return (
    <SeriesCardFrame
      testID={tid}
      index={index}
      total={total}
      tileText={`×${rounds}`}
      kicker={`Série ${index + 1}`}
      summary={serieSummary(group)}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onDelete={onDelete}
    >
      {/* Modèle + répétitions + récup R */}
      <View
        style={{ flexDirection: 'row', gap: spacing[3], flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <View style={{ flex: 1, minWidth: 130 }}>
          <FieldLabel>Modèle</FieldLabel>
          <PresetPicker
            testID={`${tid}-preset`}
            presets={ENDURANCE_PRESETS}
            selectedKey={selectedPresetKey}
            onSelect={(key) => {
              setSelectedPresetKey(key);
              onApplyPreset(key);
            }}
          />
        </View>
        <View>
          <FieldLabel>Répétitions</FieldLabel>
          <Stepper
            testID={`${tid}-rounds`}
            value={rounds}
            min={1}
            max={30}
            onValueChange={(v) => onPatchGroup({ rounds: String(v) })}
            accessibilityLabel="Nombre de répétitions"
          />
        </View>
        <View>
          <FieldLabel>Récup. R</FieldLabel>
          <InlineNumberInput
            testID={`${tid}-restR`}
            value={restR > 0 ? String(restR) : ''}
            onChangeText={(t) => {
              const v = parseInt(t, 10);
              onPatchGroup({ restBetweenRoundsSeconds: String(isNaN(v) ? 0 : v) });
            }}
            placeholder="0"
            unit="s"
          />
        </View>
      </View>

      {/* Unité distance / durée */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Unité d'effort</FieldLabel>
        <SegmentedControl
          testIDPrefix={`${tid}-unit`}
          options={UNITS}
          selected={unit}
          onSelect={(v) => onSetUnit(v as 'distance' | 'duration')}
        />
      </View>

      {/* Tableau des efforts */}
      <EffortTable
        title="Efforts de la série"
        onAddRow={onAddEffort}
        addRowTestID={`${tid}-add-effort`}
        columns={[
          { label: unit === 'duration' ? 'Effort' : 'Distance' },
          { label: field.unit === '%' ? '% VMA' : field.unit === 'z' ? 'Zone' : 'Allure' },
          { label: 'Récup r' },
        ]}
      >
        {group.items.map((block, bi) => (
          <EnduranceRow
            key={block.key}
            block={block}
            index={bi}
            unit={unit}
            intensityField={field}
            canDelete={group.items.length > 1}
            onPatch={(patch) => onPatchEffort(bi, patch)}
            onDelete={() => onRemoveEffort(bi)}
            testIDPrefix={`${tid}-effort-${bi}`}
          />
        ))}
      </EffortTable>

      {/* Référentiel d'intensité */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Référentiel d'intensité</FieldLabel>
        <SegmentedControl
          testIDPrefix={`${tid}-imode`}
          options={INTENSITY_MODES}
          selected={intensityMode}
          onSelect={(v) => onPatchSerieParam({ intensityMode: v })}
        />
        <InfoNote>
          {intensityMode === 'pace'
            ? 'Allure cible en s/km, commune à tous les athlètes.'
            : intensityMode === 'zone'
              ? 'Zone cardio 1–5 selon la fréquence cardiaque max de chaque athlète.'
              : 'Intensité en % de la VMA individuelle de chaque athlète.'}
        </InfoNote>
      </View>

      {/* Type de récupération */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Récupération</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {RECOVERY_TYPES.map((r) => (
            <Chip
              key={r.value}
              testID={`${tid}-rec-${r.value}`}
              selected={recoveryType === r.value}
              onPress={() => onPatchSerieParam({ recoveryType: r.value })}
            >
              {r.label}
            </Chip>
          ))}
        </View>
      </View>
    </SeriesCardFrame>
  );
}

// ---------- Rangée effort -------------------------------------------------------------------

function EnduranceRow({
  block,
  index,
  unit,
  intensityField: field,
  canDelete,
  onPatch,
  onDelete,
  testIDPrefix,
}: {
  block: EditableBlock;
  index: number;
  unit: 'distance' | 'duration';
  intensityField: { key: string; unit: string; decimal: boolean };
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
      deleteLabel="Supprimer cet effort"
    >
      {unit === 'duration' ? (
        <CellInput
          testID={`${testIDPrefix}-work`}
          value={block.params.workSeconds ?? ''}
          onChangeText={(t) => onPatch({ workSeconds: t })}
          unit="s"
        />
      ) : (
        <CellInput
          testID={`${testIDPrefix}-dist`}
          value={block.params.distanceMeters ?? ''}
          onChangeText={(t) => onPatch({ distanceMeters: t })}
          unit="m"
        />
      )}
      <CellInput
        testID={`${testIDPrefix}-int`}
        value={block.params[field.key] ?? ''}
        onChangeText={(t) => onPatch({ [field.key]: t })}
        unit={field.unit}
        decimal={field.decimal}
      />
      <CellInput
        testID={`${testIDPrefix}-rec`}
        value={block.params.recoverySeconds ?? ''}
        onChangeText={(t) => onPatch({ recoverySeconds: t })}
        unit="s"
      />
    </EffortRowFrame>
  );
}
