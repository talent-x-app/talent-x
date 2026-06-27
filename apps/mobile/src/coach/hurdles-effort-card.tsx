import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { BlockType } from '@talent-x/api-client';
import { Chip, Stepper } from '../components/ui';
import {
  isEditableGroup,
  makeBlock,
  makeCooldownBlock,
  makeSeriesGroup,
  makeWarmupBlock,
  nodesToItems,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';
import { HURDLES_PRESETS, targetTimeFromRecord } from './assistant-presets';
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
  WarmupCooldownBar,
  formatMinutes,
  splitEffortNodes,
} from './effort-card-shared';

/**
 * Canvas Haies (ADR-39, TLX-166) — même patron que Sprint : Échauffement · cartes de série ·
 * Retour au calme · + ajouter. 1 carte = 1 série, 1 ligne = 1 passage de haies. Les paramètres
 * techniques de l'épreuve (épreuve, rythme, espacement, nb de haies, jambe d'attaque, départ,
 * référentiel d'intensité) sont partagés par la série ; distance/hauteur/récup varient par
 * passage. Zéro changement de contrat — sérialisé via `nodesToItems`.
 */

// ---------- Référence données ----------------------------------------------------------------

const START_TYPES = [
  { value: 'standing', label: 'Debout' },
  { value: 'three_point', label: '3 appuis' },
  { value: 'blocks', label: 'Blocs' },
  { value: 'flying', label: 'Lancé' },
];

const LEAD_LEGS = [
  { value: 'left', label: 'Gauche' },
  { value: 'right', label: 'Droite' },
  { value: 'alt', label: 'Alternée' },
];

const INTENSITY_MODES = [
  { value: 'percent_record', label: '% record' },
  { value: 'target_time', label: 'Temps cible' },
  { value: 'speed', label: 'Vitesse m/s' },
];

const SEXES = [
  { value: 'H', label: 'Hommes' },
  { value: 'F', label: 'Femmes' },
];

// ---------- Helpers -------------------------------------------------------------------------

/** Propriétés partagées d'une série, lues depuis le premier passage du groupe. */
function serieProps(group: EditableGroup) {
  const first = group.items[0];
  return {
    event: first?.params.event ?? 'Haies',
    rhythmSteps: first?.params.rhythmSteps ?? '',
    spacingMeters: first?.params.spacingMeters ?? '',
    hurdleCount: first?.params.hurdleCount ?? '',
    leadLeg: first?.params.leadLeg ?? 'left',
    startType: first?.params.startType ?? 'blocks',
    intensityMode: first?.params.intensityMode ?? 'percent_record',
    intensityValue: first?.params.intensityValue ?? '',
    sex: (first?.params.sex ?? 'H') as 'H' | 'F',
    rounds: Math.max(1, Number(group.rounds) || 1),
    restR: Math.max(0, Number(group.restBetweenRoundsSeconds) || 0),
  };
}

/**
 * Clé du modèle dont la série amorcée correspond (match par nom de série), pour pré-sélectionner
 * le sélecteur. `''` si aucune correspondance (séance custom/éditée). Ne fait que le libellé —
 * sûr pour l'édition (aucun contenu appliqué).
 */
function matchPresetKey(group: EditableGroup): string {
  for (const p of HURDLES_PRESETS) {
    const g = p.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (g && g.name === group.name) return p.key;
  }
  return '';
}

/** Résumé condensé d'une série pour la tuile réduite. */
function serieSummary(group: EditableGroup): string {
  const { event, rhythmSteps, hurdleCount, rounds, restR } = serieProps(group);
  const heights = group.items.map((b) => b.params.heightCm ?? '?').join('·');
  const parts = [`${rounds} × ${event}`];
  if (hurdleCount) parts.push(`${hurdleCount} haies`);
  parts.push(`${heights} cm`);
  if (rhythmSteps) parts.push(`${rhythmSteps} appuis`);
  parts.push(`R ${formatMinutes(restR)}`);
  return parts.join(' · ');
}

/** Note du référentiel d'intensité, selon le mode (record-relatif vs cible absolue). */
function intensityNote(mode: string, targetTime?: number): string {
  if (mode === 'target_time') return 'Temps cible absolu (s), commun à tous les athlètes.';
  if (mode === 'speed') return 'Vitesse cible (m/s), commune à tous les athlètes.';
  return `Cible individualisée · % du record sur l'épreuve de chaque athlète. La distance de course sert au suivi de progression.${
    targetTime != null ? ` (≈ ${targetTime} s sur la référence du module)` : ''
  }`;
}

/** Estimation de durée globale (base 25 min échauff + passages + récups). */
function estMinutes(series: EditableGroup[]): number {
  let sec = 25 * 60;
  for (const g of series) {
    const { rounds, restR } = serieProps(g);
    const recupItems = g.items.reduce((a, b) => a + (Number(b.params.recoverySeconds) || 300), 0);
    sec += rounds * (recupItems + g.items.length * 20) + (rounds - 1) * restR;
  }
  return Math.round(sec / 60);
}

/** Passage de haies avec les propriétés partagées de la série. */
function makeHurdleBlock(opts: {
  event: string;
  distanceMeters?: number;
  heightCm?: number;
  spacingMeters?: string;
  hurdleCount?: string;
  rhythmSteps?: string;
  leadLeg: string;
  startType: string;
  intensityMode: string;
  intensityValue?: string;
  sex?: 'H' | 'F';
  recovery?: number;
}): EditableBlock {
  return makeBlock({
    type: BlockType.hurdles,
    name: opts.event,
    params: {
      event: opts.event,
      distanceMeters: String(opts.distanceMeters ?? 110),
      heightCm: String(opts.heightCm ?? 84),
      spacingMeters: opts.spacingMeters ?? '',
      spacingMode: 'regulation',
      hurdleCount: opts.hurdleCount ?? '',
      rhythmSteps: opts.rhythmSteps ?? '',
      leadLeg: opts.leadLeg,
      startType: opts.startType,
      intensityMode: opts.intensityMode,
      intensityValue: opts.intensityValue ?? '',
      sex: opts.sex ?? 'H',
      recoverySeconds: String(opts.recovery ?? 300),
    },
  });
}

function defaultHurdleSeries(): EditableGroup {
  // Une série ajoutée part du 1er preset (110 m haies) → un modèle est sélectionné par défaut
  // (match par nom) et l'épreuve / la ligne sont pré-remplies, comme l'amorce de l'assistant.
  const g = HURDLES_PRESETS[0]?.build().find((n) => isEditableGroup(n)) as
    | EditableGroup
    | undefined;
  if (g) return g;
  return makeSeriesGroup({
    name: 'Série de haies',
    rounds: '4',
    restBetweenRoundsSeconds: '300',
    items: [
      makeHurdleBlock({
        event: 'Haies',
        distanceMeters: 110,
        heightCm: 84,
        leadLeg: 'left',
        startType: 'blocks',
        intensityMode: 'percent_record',
        recovery: 300,
      }),
    ],
  });
}

// ---------- Canvas principal ----------------------------------------------------------------

export function HurdlesEffortCanvas({
  nodes,
  onChange,
  embedded = false,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
  embedded?: boolean;
}) {
  const { warmup, cooldown, series } = splitEffortNodes(
    nodes,
    BlockType.warmup,
    BlockType.cooldown,
    makeWarmupBlock,
    makeCooldownBlock,
  );

  function commit(
    newSeries: EditableGroup[],
    newWarmup: EditableBlock = warmup,
    newCooldown: EditableBlock = cooldown,
  ) {
    // En mode encart (composite ADR-42), l'échauffement / retour au calme sont portés au niveau
    // séance : on ne sérialise que les séries, sinon un warmup/cooldown fantôme est réinjecté au
    // milieu de la séance composite à chaque interaction. En standalone, on encadre comme avant.
    onChange(embedded ? newSeries : [newWarmup, ...newSeries, newCooldown]);
  }

  function patchGroup(gi: number, patch: Partial<EditableGroup>) {
    commit(series.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }

  /** Met à jour un param partagé de série sur tous les passages du groupe. */
  function patchSerieParam(gi: number, paramPatch: Record<string, string>) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        return {
          ...g,
          items: g.items.map((b) => {
            const params = { ...b.params, ...paramPatch };
            return { ...b, name: params.event || b.name, params };
          }),
        };
      }),
    );
  }

  function patchPass(gi: number, bi: number, paramPatch: Record<string, string>) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        return {
          ...g,
          items: g.items.map((b, j) =>
            j === bi ? { ...b, params: { ...b.params, ...paramPatch } } : b,
          ),
        };
      }),
    );
  }

  function addPass(gi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const p = serieProps(g);
        const last = g.items[g.items.length - 1];
        return {
          ...g,
          items: [
            ...g.items,
            makeHurdleBlock({
              event: p.event,
              distanceMeters: Number(last?.params.distanceMeters) || 110,
              heightCm: Number(last?.params.heightCm) || 84,
              spacingMeters: p.spacingMeters,
              hurdleCount: p.hurdleCount,
              rhythmSteps: p.rhythmSteps,
              leadLeg: p.leadLeg,
              startType: p.startType,
              intensityMode: p.intensityMode,
              intensityValue: p.intensityValue,
              sex: p.sex,
              recovery: 300,
            }),
          ],
        };
      }),
    );
  }

  function removePass(gi: number, bi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const remaining = g.items.filter((_, j) => j !== bi);
        return { ...g, items: remaining.length > 0 ? remaining : g.items };
      }),
    );
  }

  function addSerie() {
    commit([...series, defaultHurdleSeries()]);
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
    const preset = HURDLES_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const builtGroup = preset.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (!builtGroup) return;
    commit(series.map((g, i) => (i === gi ? { ...builtGroup, key: g.key } : g)));
  }

  const kpis = sessionKpis(nodesToItems(series));
  const volStr = formatDistanceVolume(kpis.distanceMeters) ?? '0 m';

  return (
    <EffortCanvasShell
      testID="hurdles-effort-canvas"
      header={
        embedded ? undefined : (
          <CanvasKpiHeader
            testID="hurdles-canvas-summary"
            title={`Course haies : ${volStr}`}
            subtitle={`· ${kpis.efforts} passages · ~${estMinutes(series)} min`}
          />
        )
      }
      warmup={
        embedded ? undefined : (
          <WarmupCooldownBar
            testID="warmup-bar"
            icon="activity"
            title={warmup.name}
            subtitle={warmup.notes}
            onEditNotes={(notes) => commit(series, { ...warmup, notes }, cooldown)}
          />
        )
      }
      cooldown={
        embedded ? undefined : (
          <WarmupCooldownBar
            testID="cooldown-bar"
            icon="wind"
            title={cooldown.name}
            subtitle={cooldown.notes}
            onEditNotes={(notes) => commit(series, warmup, { ...cooldown, notes })}
          />
        )
      }
      onAddSeries={addSerie}
      addSeriesTestID="hurdles-add-series"
    >
      {series.map((group, gi) => (
        <HurdlesSeriesCard
          key={group.key}
          group={group}
          index={gi}
          total={series.length}
          onPatchGroup={(patch) => patchGroup(gi, patch)}
          onPatchSerieParam={(patch) => patchSerieParam(gi, patch)}
          onPatchPass={(bi, patch) => patchPass(gi, bi, patch)}
          onAddPass={() => addPass(gi)}
          onRemovePass={(bi) => removePass(gi, bi)}
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

function HurdlesSeriesCard({
  group,
  index,
  total,
  onPatchGroup,
  onPatchSerieParam,
  onPatchPass,
  onAddPass,
  onRemovePass,
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
  onPatchPass: (bi: number, patch: Record<string, string>) => void;
  onAddPass: () => void;
  onRemovePass: (bi: number) => void;
  onApplyPreset: (key: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [selectedPresetKey, setSelectedPresetKey] = useState(() => matchPresetKey(group));
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const tid = `series-card-${index}`;
  const {
    event,
    rhythmSteps,
    spacingMeters,
    hurdleCount,
    leadLeg,
    startType,
    intensityMode,
    intensityValue,
    sex,
    rounds,
    restR,
  } = serieProps(group);
  const targetTime =
    intensityMode === 'percent_record'
      ? targetTimeFromRecord(event, sex, Number(intensityValue) || 0)
      : undefined;

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
      {/* Modèle : pleine largeur (l'ouverture du sélecteur ne décale plus « Séries »). */}
      <View>
        <FieldLabel>Modèle</FieldLabel>
        <PresetPicker
          testID={`${tid}-preset`}
          presets={HURDLES_PRESETS}
          selectedKey={selectedPresetKey}
          onSelect={(key) => {
            setSelectedPresetKey(key);
            onApplyPreset(key);
          }}
        />
      </View>

      {/* Tours + récup R — deux colonnes égales, côte à côte (structure régulière). */}
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
            placeholder="0"
            unit="min"
          />
        </View>
      </View>

      {/* Épreuve & ligne de haies — dispositif commun à la série : l'épreuve (référentiel de record)
          et le dispositif (hauteur / nb / espacement / rythme), d'où est dérivée la distance de
          course. La hauteur est la **source unique** (appliquée à tous les passages → plus de
          doublon avec le tableau). */}
      <View
        testID={`${tid}-hurdle-line`}
        style={{
          gap: spacing[3],
          padding: spacing[3],
          borderRadius: radius.md,
          borderWidth: borderWidth.hairline,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surfaceSunken,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.caption.fontSize,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          Épreuve & ligne de haies
        </Text>

        <View>
          <FieldLabel>Épreuve</FieldLabel>
          <CellInput
            testID={`${tid}-event`}
            value={event}
            onChangeText={(t) => onPatchSerieParam({ event: t })}
            placeholder="Ex. 110mH"
            text
          />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <FieldLabel>Hauteur</FieldLabel>
            <CellInput
              testID={`${tid}-line-height`}
              value={group.items[0]?.params.heightCm ?? ''}
              onChangeText={(t) => onPatchSerieParam({ heightCm: t })}
              unit="cm"
              decimal
              placeholder="84"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FieldLabel>Nb de haies</FieldLabel>
            <CellInput
              testID={`${tid}-hurdleCount`}
              value={hurdleCount}
              onChangeText={(t) => onPatchSerieParam({ hurdleCount: t })}
              placeholder="10"
            />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <View style={{ flex: 1 }}>
            <FieldLabel>Espacement</FieldLabel>
            <CellInput
              testID={`${tid}-spacing`}
              value={spacingMeters}
              onChangeText={(t) => onPatchSerieParam({ spacingMeters: t })}
              unit="m"
              decimal
              placeholder="9.14"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FieldLabel>Rythme</FieldLabel>
            <CellInput
              testID={`${tid}-rhythm`}
              value={rhythmSteps}
              onChangeText={(t) => onPatchSerieParam({ rhythmSteps: t })}
              unit="appuis"
              placeholder="3"
            />
          </View>
        </View>
      </View>

      {/* Tableau des passages */}
      <EffortTable
        title="Passages de la série"
        onAddRow={onAddPass}
        addRowTestID={`${tid}-add-pass`}
        columns={[{ label: 'Distance' }, { label: 'Intensité' }, { label: 'Récup r', width: 72 }]}
      >
        {group.items.map((block, bi) => (
          <HurdlePassRow
            key={block.key}
            intensityMode={intensityMode}
            block={block}
            index={bi}
            isLast={bi === group.items.length - 1}
            canDelete={group.items.length > 1}
            onPatch={(patch) => onPatchPass(bi, patch)}
            onDelete={() => onRemovePass(bi)}
            testIDPrefix={`${tid}-pass-${bi}`}
          />
        ))}
      </EffortTable>

      {/* Catégorie (pour le référentiel de record) */}
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

      {/* Référentiel d'intensité */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Référentiel d'intensité</FieldLabel>
        <SegmentedControl
          testIDPrefix={`${tid}-imode`}
          options={INTENSITY_MODES}
          selected={intensityMode}
          // Réinitialise la valeur d'intensité au changement de référentiel (un % n'a aucun sens
          // en s/m/s ; conversion non calculable au design-time). Cohérent avec le canvas Sprint.
          onSelect={(v) => {
            if (v === intensityMode) return;
            onPatchSerieParam({ intensityMode: v, intensityValue: '' });
          }}
        />
        {/* L'intensité se saisit désormais **par passage** (colonne « Intensité » du tableau,
            comme Sprint) ; le référentiel ci-dessus en fixe l'unité (%, s, m/s). */}
        <InfoNote>{intensityNote(intensityMode, targetTime)}</InfoNote>
      </View>

      {/* Jambe d'attaque + départ */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Jambe d'attaque</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {LEAD_LEGS.map((l) => (
            <Chip
              key={l.value}
              testID={`${tid}-lead-${l.value}`}
              selected={leadLeg === l.value}
              onPress={() => onPatchSerieParam({ leadLeg: l.value })}
            >
              {l.label}
            </Chip>
          ))}
        </View>
      </View>
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Départ</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {START_TYPES.map((st) => (
            <Chip
              key={st.value}
              testID={`${tid}-start-${st.value}`}
              selected={startType === st.value}
              onPress={() => onPatchSerieParam({ startType: st.value })}
            >
              {st.label}
            </Chip>
          ))}
        </View>
      </View>
    </SeriesCardFrame>
  );
}

// ---------- Rangée passage ------------------------------------------------------------------

function HurdlePassRow({
  block,
  index,
  isLast,
  canDelete,
  intensityMode,
  onPatch,
  onDelete,
  testIDPrefix,
}: {
  block: EditableBlock;
  index: number;
  isLast: boolean;
  canDelete: boolean;
  intensityMode: string;
  onPatch: (patch: Record<string, string>) => void;
  onDelete: () => void;
  testIDPrefix: string;
}) {
  const { colors, typography } = useTheme();
  const intensityUnit =
    intensityMode === 'speed' ? 'm/s' : intensityMode === 'target_time' ? 's' : '%';
  return (
    <EffortRowFrame
      testID={testIDPrefix}
      index={index}
      canDelete={canDelete}
      onDelete={onDelete}
      deleteLabel="Supprimer ce passage"
    >
      <CellInput
        testID={`${testIDPrefix}-dist`}
        value={block.params.distanceMeters ?? ''}
        onChangeText={(t) => onPatch({ distanceMeters: t })}
        unit="m"
        decimal
      />
      <CellInput
        testID={`${testIDPrefix}-int`}
        value={block.params.intensityValue ?? ''}
        onChangeText={(t) => onPatch({ intensityValue: t })}
        unit={intensityUnit}
        decimal={intensityMode !== 'percent_record'}
      />
      {/* Colonne « récup » à largeur fixe (72) → la dernière ligne (« → R ») reste alignée. */}
      {isLast ? (
        <View style={{ width: 72, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            → R
          </Text>
        </View>
      ) : (
        <View style={{ width: 72 }}>
          <CellInput
            testID={`${testIDPrefix}-rec`}
            value={
              block.params.recoverySeconds ? String(Number(block.params.recoverySeconds) / 60) : ''
            }
            onChangeText={(t) => {
              const v = parseFloat(t);
              onPatch({ recoverySeconds: String(isNaN(v) ? 0 : Math.round(v * 60)) });
            }}
            unit="min"
            decimal
          />
        </View>
      )}
    </EffortRowFrame>
  );
}
