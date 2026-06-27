import { useState } from 'react';
import { Text, View } from 'react-native';
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
import { JUMPS_PRESETS, JUMP_RECORDS, targetDistanceFromRecord } from './assistant-presets';
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
 * Canvas Sauts (ADR-39, TLX-167). Deux rendus selon la discipline :
 *  - **horizontal** (longueur/triple → `type:"jumps"`) : 1 ligne = 1 saut (élan, essais, cible) ;
 *  - **vertical** (hauteur/perche → `type:"vertical_jumps"`, ADR-25) : grille de barres dérivée
 *    (barre de départ + montée), prévisualisée et pré-remplie pour le suivi côté athlète.
 * Changer de discipline reconvertit le bloc de la série. Pas d'échauffement/RAC encadrants.
 * Zéro changement de contrat.
 */

// ---------- Référence données ----------------------------------------------------------------

const DISCIPLINES = [
  { value: 'long', label: 'Longueur' },
  { value: 'triple', label: 'Triple' },
  { value: 'high', label: 'Hauteur' },
  { value: 'pole', label: 'Perche' },
];

const APPROACH_UNITS = [
  { value: 'steps', label: 'Foulées' },
  { value: 'meters', label: 'Mètres' },
];

const TAKEOFFS = [
  { value: 'board', label: 'Planche' },
  { value: 'zone', label: 'Zone' },
];

const TARGET_MODES = [
  { value: 'percent_record', label: '% record' },
  { value: 'absolute', label: 'Cible (m)' },
];

function isVerticalDiscipline(d: string): boolean {
  return d === 'high' || d === 'pole';
}

function disciplineLabel(value: string): string {
  return DISCIPLINES.find((d) => d.value === value)?.label ?? value;
}

// ---------- Helpers -------------------------------------------------------------------------

function serieProps(group: EditableGroup) {
  const first = group.items[0];
  const discipline = first?.params.discipline ?? 'long';
  return {
    discipline,
    vertical: isVerticalDiscipline(discipline),
    approachUnit: first?.params.approachUnit ?? 'steps',
    takeoff: first?.params.takeoff ?? 'board',
    targetMode: first?.params.targetMode ?? 'percent_record',
    rounds: Math.max(1, Number(group.rounds) || 1),
    restR: Math.max(0, Number(group.restBetweenRoundsSeconds) || 0),
  };
}

/** Hauteurs de barres dérivées (barre de départ + i × montée), pour la grille verticale. */
function barHeights(block: EditableBlock): number[] {
  const start = Number(block.params.startHeightCm) || 0;
  const inc = Number(block.params.incrementCm) || 0;
  const bars = Math.max(0, Number(block.params.bars) || 0);
  return Array.from({ length: bars }, (_, i) => start + i * inc);
}

function totalAttempts(series: EditableGroup[]): number {
  let n = 0;
  for (const g of series) {
    const rounds = Math.max(1, Number(g.rounds) || 1);
    for (const b of g.items) {
      if (b.type === BlockType.vertical_jumps) {
        n += (Number(b.params.bars) || 0) * (Number(b.params.attemptsPerBar) || 0);
      } else {
        n += (Number(b.params.attempts) || 0) * rounds;
      }
    }
  }
  return n;
}

function serieSummary(group: EditableGroup): string {
  const { discipline, vertical, rounds } = serieProps(group);
  const first = group.items[0];
  if (vertical) {
    const heights = barHeights(first);
    const range = heights.length ? `${heights[0]}→${heights[heights.length - 1]} cm` : '';
    return [disciplineLabel(discipline), `${first?.params.bars ?? 0} barres`, range]
      .filter(Boolean)
      .join(' · ');
  }
  const attempts = group.items.reduce((a, b) => a + (Number(b.params.attempts) || 0), 0) * rounds;
  const approaches = group.items.map((b) => b.params.approach ?? '?').join('·');
  return `${disciplineLabel(discipline)} · élan ${approaches} · ${attempts} essais`;
}

function estMinutes(series: EditableGroup[]): number {
  // ≈3 min par essai (mise en place piste/sautoir) + 15 min de mise en train.
  return Math.round(totalAttempts(series) * 3) + 15;
}

function makeHorizontalJump(opts: {
  discipline: string;
  approachUnit: string;
  takeoff: string;
  targetMode: string;
  approach?: number;
  attempts?: number;
}): EditableBlock {
  return makeBlock({
    type: BlockType.jumps,
    name: disciplineLabel(opts.discipline),
    params: {
      discipline: opts.discipline,
      approach: String(opts.approach ?? 12),
      approachUnit: opts.approachUnit,
      attempts: String(opts.attempts ?? 1),
      takeoff: opts.takeoff,
      targetMode: opts.targetMode,
    },
  });
}

/** Clé du modèle dont la série amorcée correspond (match par nom) — pré-sélection du picker. */
function matchPresetKey(group: EditableGroup): string {
  for (const p of JUMPS_PRESETS) {
    const g = p.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (g && g.name === group.name) return p.key;
  }
  return '';
}

function defaultJumpSeries(): EditableGroup {
  // Série ajoutée = 1er preset → modèle sélectionné par défaut + table pré-remplie.
  const g = JUMPS_PRESETS[0]?.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
  if (g) return g;
  return makeSeriesGroup({
    name: 'Série de sauts',
    rounds: '6',
    restBetweenRoundsSeconds: '240',
    items: [
      makeHorizontalJump({
        discipline: 'long',
        approachUnit: 'steps',
        takeoff: 'board',
        targetMode: 'percent_record',
        approach: 18,
        attempts: 1,
      }),
    ],
  });
}

// ---------- Canvas principal ----------------------------------------------------------------

export function JumpsEffortCanvas({
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

  function patchSerieParam(gi: number, paramPatch: Record<string, string>) {
    commit(
      series.map((g, i) =>
        i === gi
          ? { ...g, items: g.items.map((b) => ({ ...b, params: { ...b.params, ...paramPatch } })) }
          : g,
      ),
    );
  }

  /** Change la discipline : reconvertit le bloc de la série (horizontal ↔ vertical). */
  function patchJump(gi: number, bi: number, paramPatch: Record<string, string>) {
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

  function addJump(gi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const p = serieProps(g);
        const last = g.items[g.items.length - 1];
        return {
          ...g,
          items: [
            ...g.items,
            makeHorizontalJump({
              discipline: p.discipline,
              approachUnit: p.approachUnit,
              takeoff: p.takeoff,
              targetMode: p.targetMode,
              approach: Number(last?.params.approach) || 12,
              attempts: 1,
            }),
          ],
        };
      }),
    );
  }

  function removeJump(gi: number, bi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const remaining = g.items.filter((_, j) => j !== bi);
        return { ...g, items: remaining.length > 0 ? remaining : g.items };
      }),
    );
  }

  function addSerie() {
    commit([...series, defaultJumpSeries()]);
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
    const preset = JUMPS_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const builtGroup = preset.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (!builtGroup) return;
    commit(series.map((g, i) => (i === gi ? { ...builtGroup, key: g.key } : g)));
  }

  return (
    <EffortCanvasShell
      testID="jumps-effort-canvas"
      header={
        embedded ? undefined : (
          <CanvasKpiHeader
            testID="jumps-canvas-summary"
            title={`${totalAttempts(series)} essais planifiés`}
            subtitle={`· ~${estMinutes(series)} min`}
          />
        )
      }
      onAddSeries={addSerie}
      addSeriesTestID="jumps-add-series"
    >
      {series.map((group, gi) => (
        <JumpsSeriesCard
          key={group.key}
          group={group}
          index={gi}
          total={series.length}
          onPatchGroup={(patch) => patchGroup(gi, patch)}
          onPatchSerieParam={(patch) => patchSerieParam(gi, patch)}
          onPatchJump={(bi, patch) => patchJump(gi, bi, patch)}
          onAddJump={() => addJump(gi)}
          onRemoveJump={(bi) => removeJump(gi, bi)}
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

function JumpsSeriesCard({
  group,
  index,
  total,
  onPatchGroup,
  onPatchSerieParam,
  onPatchJump,
  onAddJump,
  onRemoveJump,
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
  onPatchJump: (bi: number, patch: Record<string, string>) => void;
  onAddJump: () => void;
  onRemoveJump: (bi: number) => void;
  onApplyPreset: (key: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [selectedPresetKey, setSelectedPresetKey] = useState(() => matchPresetKey(group));
  const tid = `series-card-${index}`;
  const { vertical, approachUnit, takeoff, targetMode, rounds } = serieProps(group);

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
      {/* Modèle : pleine largeur (l'ouverture du sélecteur ne décale plus « Passages »). */}
      <View>
        <FieldLabel>Modèle</FieldLabel>
        <PresetPicker
          testID={`${tid}-preset`}
          presets={JUMPS_PRESETS}
          selectedKey={selectedPresetKey}
          onSelect={(key) => {
            setSelectedPresetKey(key);
            onApplyPreset(key);
          }}
        />
      </View>
      {!vertical && (
        <View>
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
      )}

      {/* La discipline (longueur/triple/hauteur/perche) est portée par le Modèle — pas de sélecteur
          séparé (évitait un doublon désynchronisé avec « Modèle » ; le modèle bascule aussi
          l'éditeur horizontal/vertical). */}

      {vertical ? (
        <VerticalJumpEditor
          block={group.items[0]}
          tid={tid}
          onPatch={(patch) => onPatchJump(0, patch)}
        />
      ) : (
        <HorizontalJumpEditor
          group={group}
          tid={tid}
          approachUnit={approachUnit}
          takeoff={takeoff}
          targetMode={targetMode}
          onPatchSerieParam={onPatchSerieParam}
          onPatchJump={onPatchJump}
          onAddJump={onAddJump}
          onRemoveJump={onRemoveJump}
        />
      )}
    </SeriesCardFrame>
  );
}

// ---------- Éditeur horizontal (longueur / triple) ------------------------------------------

function HorizontalJumpEditor({
  group,
  tid,
  approachUnit,
  takeoff,
  targetMode,
  onPatchSerieParam,
  onPatchJump,
  onAddJump,
  onRemoveJump,
}: {
  group: EditableGroup;
  tid: string;
  approachUnit: string;
  takeoff: string;
  targetMode: string;
  onPatchSerieParam: (patch: Record<string, string>) => void;
  onPatchJump: (bi: number, patch: Record<string, string>) => void;
  onAddJump: () => void;
  onRemoveJump: (bi: number) => void;
}) {
  const { spacing } = useTheme();
  const approachLabel = approachUnit === 'meters' ? 'm' : 'foul.';
  const discipline = group.items[0]?.params.discipline ?? 'long';
  const targetValue =
    targetMode === 'absolute'
      ? (group.items[0]?.params.targetMeters ?? '')
      : (group.items[0]?.params.targetPercent ?? '');
  const targetDistance =
    targetMode === 'percent_record'
      ? targetDistanceFromRecord(JUMP_RECORDS, discipline, Number(targetValue) || 0)
      : undefined;

  return (
    <>
      {/* Unité d'élan + pied d'appel */}
      <View style={{ flexDirection: 'row', gap: spacing[4], flexWrap: 'wrap' }}>
        <View style={{ gap: spacing[2], flex: 1, minWidth: 150 }}>
          <FieldLabel>Unité d'élan</FieldLabel>
          <SegmentedControl
            testIDPrefix={`${tid}-aunit`}
            options={APPROACH_UNITS}
            selected={approachUnit}
            onSelect={(v) => onPatchSerieParam({ approachUnit: v })}
          />
        </View>
        <View style={{ gap: spacing[2] }}>
          <FieldLabel>Planche / Zone</FieldLabel>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {TAKEOFFS.map((t) => (
              <Chip
                key={t.value}
                testID={`${tid}-takeoff-${t.value}`}
                selected={takeoff === t.value}
                onPress={() => onPatchSerieParam({ takeoff: t.value })}
              >
                {t.label}
              </Chip>
            ))}
          </View>
        </View>
      </View>

      {/* Tableau des sauts */}
      <EffortTable
        title="Sauts de la série"
        onAddRow={onAddJump}
        addRowTestID={`${tid}-add-jump`}
        columns={[{ label: `Élan (${approachLabel})` }, { label: 'Essais' }]}
      >
        {group.items.map((block, bi) => (
          <EffortRowFrame
            key={block.key}
            testID={`${tid}-jump-${bi}`}
            index={bi}
            canDelete={group.items.length > 1}
            onDelete={() => onRemoveJump(bi)}
            deleteLabel="Supprimer ce saut"
          >
            <CellInput
              testID={`${tid}-jump-${bi}-approach`}
              value={block.params.approach ?? ''}
              onChangeText={(t) => onPatchJump(bi, { approach: t })}
              unit={approachLabel}
              decimal={approachUnit === 'meters'}
            />
            <CellInput
              testID={`${tid}-jump-${bi}-attempts`}
              value={block.params.attempts ?? ''}
              onChangeText={(t) => onPatchJump(bi, { attempts: t })}
            />
          </EffortRowFrame>
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
        <InlineNumberInput
          testID={`${tid}-target`}
          value={targetValue}
          onChangeText={(t) =>
            onPatchSerieParam(
              targetMode === 'absolute' ? { targetMeters: t } : { targetPercent: t },
            )
          }
          placeholder={targetMode === 'absolute' ? '7.20' : '95'}
          unit={targetMode === 'absolute' ? 'm' : '%'}
        />
        <InfoNote>
          {targetMode === 'absolute'
            ? 'Distance cible absolue, commune à tous les athlètes.'
            : `Cible individualisée · % du record de chaque athlète${
                targetDistance != null ? ` (≈ ${targetDistance} m sur la référence du module)` : ''
              }.`}
        </InfoNote>
      </View>
    </>
  );
}

// ---------- Éditeur vertical (hauteur / perche) ---------------------------------------------

function VerticalJumpEditor({
  block,
  tid,
  onPatch,
}: {
  block: EditableBlock;
  tid: string;
  onPatch: (patch: Record<string, string>) => void;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const pole = block.params.discipline === 'pole';
  const heights = barHeights(block);

  return (
    <>
      {/* Paramètres de la grille */}
      <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 110 }}>
          <FieldLabel>Barre de départ</FieldLabel>
          <CellInput
            testID={`${tid}-startHeight`}
            value={block.params.startHeightCm ?? ''}
            onChangeText={(t) => onPatch({ startHeightCm: t })}
            unit="cm"
          />
        </View>
        <View style={{ flex: 1, minWidth: 90 }}>
          <FieldLabel>Montée</FieldLabel>
          <CellInput
            testID={`${tid}-increment`}
            value={block.params.incrementCm ?? ''}
            onChangeText={(t) => onPatch({ incrementCm: t })}
            unit="cm"
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 90 }}>
          <FieldLabel>Nb de barres</FieldLabel>
          <CellInput
            testID={`${tid}-bars`}
            value={block.params.bars ?? ''}
            onChangeText={(t) => onPatch({ bars: t })}
          />
        </View>
        <View style={{ flex: 1, minWidth: 90 }}>
          <FieldLabel>Essais / barre</FieldLabel>
          <CellInput
            testID={`${tid}-attemptsPerBar`}
            value={block.params.attemptsPerBar ?? ''}
            onChangeText={(t) => onPatch({ attemptsPerBar: t })}
          />
        </View>
        {pole && (
          <View style={{ flex: 1, minWidth: 90 }}>
            <FieldLabel>Prise</FieldLabel>
            <CellInput
              testID={`${tid}-grip`}
              value={block.params.gripCm ?? ''}
              onChangeText={(t) => onPatch({ gripCm: t })}
              unit="cm"
            />
          </View>
        )}
      </View>

      {/* Grille de barres dérivée */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Grille de barres</FieldLabel>
        <View
          testID={`${tid}-bar-grid`}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}
        >
          {heights.map((h, i) => (
            <View
              key={i}
              testID={`${tid}-bar-${i}`}
              style={{
                paddingHorizontal: spacing[3],
                paddingVertical: spacing[2],
                borderRadius: radius.sm,
                borderWidth: borderWidth.hairline,
                borderColor: colors.borderStrong,
                backgroundColor: colors.surfaceSunken,
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {h} cm
              </Text>
            </View>
          ))}
        </View>
        <InfoNote>
          La grille pré-remplit les barres côté athlète (ADR-25). Chaque barre laisse{' '}
          {block.params.attemptsPerBar ?? 3} essais avant élimination.
        </InfoNote>
      </View>
    </>
  );
}
