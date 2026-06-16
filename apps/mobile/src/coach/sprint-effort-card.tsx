import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { BlockType } from '@talent-x/api-client';
import { Button, Card, Chip, Stepper } from '../components/ui';
import {
  isEditableGroup,
  makeBlock,
  makeSeriesGroup,
  nodesToItems,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';
import { formatDistanceVolume, sessionKpis } from '../sessions/session-summary';

/**
 * Canvas Sprint (ADR-39, TLX-165) — layout fidèle à la maquette.
 * Structure : Échauffement · cartes de série · Retour au calme · + ajouter.
 * 1 carte = 1 série (EditableGroup). Chaque sprint = 1 feuille (EditableBlock).
 * Les propriétés partagées d'une série (intensityMode, startType, flyingZone)
 * sont portées par les params de chaque sprint du groupe pour garantir le round-trip
 * sans perte (invariant ADR-27/38). Zéro changement de contrat.
 */

// ---------- Référence données ----------------------------------------------------------------

const START_TYPES = [
  { value: 'standing', label: 'Debout' },
  { value: 'three_point', label: '3 appuis' },
  { value: 'blocks', label: 'Blocs' },
  { value: 'flying', label: 'Lancé' },
];

const INTENSITY_MODES = [
  { value: 'percent_record', label: '% record' },
  { value: 'target_time', label: 'Temps cible' },
  { value: 'speed', label: 'Vitesse m/s' },
];

const SPRINT_PRESETS_UI = [
  {
    key: 'accel',
    label: 'Départs / Accélération',
    seriesCount: 1,
    restR: 180,
    start: 'blocks',
    sprints: [{ distance: 30, intensity: 100, recovery: 180 }],
  },
  {
    key: 'vmax',
    label: 'Vitesse max',
    seriesCount: 2,
    restR: 360,
    start: 'blocks',
    sprints: [
      { distance: 30, intensity: 90, recovery: 180 },
      { distance: 40, intensity: 95, recovery: 240 },
      { distance: 50, intensity: 100, recovery: 300 },
    ],
  },
  {
    key: 'vendur',
    label: 'Endurance de vitesse',
    seriesCount: 1,
    restR: 480,
    start: 'three_point',
    sprints: [{ distance: 120, intensity: 95, recovery: 480 }],
  },
  {
    key: 'lactic',
    label: 'Résistance / lactique',
    seriesCount: 1,
    restR: 600,
    start: 'standing',
    sprints: [{ distance: 200, intensity: 92, recovery: 600 }],
  },
];

// ---------- Helpers -------------------------------------------------------------------------

/** Propriétés partagées d'une série, lues depuis le premier sprint du groupe. */
function serieProps(group: EditableGroup) {
  const first = group.items[0];
  return {
    intensityMode: first?.params.intensityMode ?? 'percent_record',
    startType: first?.params.startType ?? 'blocks',
    flyingZone: first?.params.flyingZone === 'true',
    rounds: Math.max(1, Number(group.rounds) || 1),
    restR: Math.max(0, Number(group.restBetweenRoundsSeconds) || 0),
  };
}

/** Résumé condensé d'une série pour la tuile réduite. */
function serieSummary(group: EditableGroup): string {
  const { intensityMode, startType, rounds, restR } = serieProps(group);
  const dists = group.items.map((b) => b.params.distanceMeters ?? '?').join('·');
  const vals = group.items.map((b) => Number(b.params.intensityValue) || 0);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const unit = intensityMode === 'percent_record' ? '%' : intensityMode === 'speed' ? ' m/s' : ' s';
  const intStr = mn === mx ? `${mn}${unit}` : `${mn}→${mx}${unit}`;
  const startLabel =
    START_TYPES.find((s) => s.value === startType)?.label.toLowerCase() ?? startType;
  const rMin = restR / 60;
  const rStr = Number.isInteger(rMin) ? `${rMin}′` : `${rMin.toFixed(1)}′`;
  return `${rounds} × (${dists} m) · ${startLabel} · ${intStr} · R ${rStr}`;
}

/** Estimation de durée globale (base 25 min échauff + efforts + récups). */
function estMinutes(series: EditableGroup[]): number {
  let sec = 25 * 60;
  for (const g of series) {
    const { rounds, restR } = serieProps(g);
    const recupItems = g.items.reduce((a, b) => a + (Number(b.params.recoverySeconds) || 180), 0);
    sec += rounds * (recupItems + g.items.length * 10) + (rounds - 1) * restR;
  }
  return Math.round(sec / 60);
}

/** Sprint bloc avec les propriétés partagées de la série. */
function makeSprintBlock(opts: {
  distance?: number;
  intensity?: number;
  recovery?: number;
  intensityMode: string;
  startType: string;
  flyingZone: boolean;
}): EditableBlock {
  const d = opts.distance ?? 60;
  return makeBlock({
    type: BlockType.sprint,
    name: `${d} m`,
    params: {
      reps: '1',
      distanceMeters: String(d),
      recoverySeconds: String(opts.recovery ?? 240),
      intensityMode: opts.intensityMode,
      intensityValue: String(opts.intensity ?? 95),
      startType: opts.startType,
      flyingZone: opts.flyingZone ? 'true' : 'false',
    },
  });
}

/** Bloc d'échauffement par défaut. */
export function makeWarmupBlock(): EditableBlock {
  return makeBlock({
    type: BlockType.warmup,
    name: 'Échauffement',
    notes: 'Footing 12′ · gammes (4×2×30 m) · 3 lignes droites · ~25 min',
    params: {},
  });
}

/** Bloc de retour au calme par défaut. */
export function makeCooldownBlock(): EditableBlock {
  return makeBlock({
    type: BlockType.cooldown,
    name: 'Retour au calme',
    notes: 'Footing 8′ · étirements · respiration · ~10 min',
    params: {},
  });
}

// ---------- Canvas principal ----------------------------------------------------------------

export function SprintEffortCanvas({
  nodes,
  onChange,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
}) {
  const { colors, typography, spacing } = useTheme();

  // Sépare échauffement / séries / retour au calme
  const warmup =
    (nodes.find((n) => !isEditableGroup(n) && (n as EditableBlock).type === BlockType.warmup) as
      | EditableBlock
      | undefined) ?? makeWarmupBlock();

  const cooldown =
    (nodes.find((n) => !isEditableGroup(n) && (n as EditableBlock).type === BlockType.cooldown) as
      | EditableBlock
      | undefined) ?? makeCooldownBlock();

  const series = nodes.filter((n) => isEditableGroup(n)) as EditableGroup[];

  function commit(
    newSeries: EditableGroup[],
    newWarmup: EditableBlock = warmup,
    newCooldown: EditableBlock = cooldown,
  ) {
    onChange([newWarmup, ...newSeries, newCooldown]);
  }

  function patchGroup(gi: number, patch: Partial<EditableGroup>) {
    commit(series.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  }

  /** Met à jour un param partagé de série sur tous les blocs du groupe. */
  function patchSerieParam(gi: number, paramPatch: Record<string, string>) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        return {
          ...g,
          items: g.items.map((b) => ({ ...b, params: { ...b.params, ...paramPatch } })),
        };
      }),
    );
  }

  /** Met à jour les params d'un sprint spécifique (bi dans le groupe gi). */
  function patchSprint(gi: number, bi: number, paramPatch: Record<string, string>) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        return {
          ...g,
          items: g.items.map((b, j) => {
            if (j !== bi) return b;
            const params = { ...b.params, ...paramPatch };
            const name =
              paramPatch.distanceMeters != null ? `${paramPatch.distanceMeters} m` : b.name;
            return { ...b, name, params };
          }),
        };
      }),
    );
  }

  function addSprint(gi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const { intensityMode, startType, flyingZone } = serieProps(g);
        const last = g.items[g.items.length - 1];
        const newSprint = makeSprintBlock({
          distance: Number(last?.params.distanceMeters) || 60,
          intensity: Number(last?.params.intensityValue) || 95,
          recovery: 240,
          intensityMode,
          startType,
          flyingZone,
        });
        return { ...g, items: [...g.items, newSprint] };
      }),
    );
  }

  function removeSprint(gi: number, bi: number) {
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const remaining = g.items.filter((_, j) => j !== bi);
        // Ne retire pas si c'est le dernier sprint
        return { ...g, items: remaining.length > 0 ? remaining : g.items };
      }),
    );
  }

  function addSerie() {
    commit([
      ...series,
      makeSeriesGroup({
        name: 'Série de sprint',
        rounds: '1',
        restBetweenRoundsSeconds: '300',
        items: [
          makeSprintBlock({
            distance: 60,
            intensity: 95,
            recovery: 240,
            intensityMode: 'percent_record',
            startType: 'blocks',
            flyingZone: false,
          }),
        ],
      }),
    ]);
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
    const preset = SPRINT_PRESETS_UI.find((p) => p.key === presetKey);
    if (!preset) return;
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        const currentIntensityMode = serieProps(g).intensityMode;
        return {
          ...g,
          rounds: String(preset.seriesCount),
          restBetweenRoundsSeconds: String(preset.restR),
          items: preset.sprints.map((sp) =>
            makeSprintBlock({
              distance: sp.distance,
              intensity: sp.intensity,
              recovery: sp.recovery,
              intensityMode: currentIntensityMode,
              startType: preset.start,
              flyingZone: false,
            }),
          ),
        };
      }),
    );
  }

  // KPIs haute intensité (hors échauffement/RAC)
  const seriesItems = nodesToItems(series);
  const kpis = sessionKpis(seriesItems);
  const volStr = formatDistanceVolume(kpis.distanceMeters) ?? '0 m';
  const sprintCount = kpis.efforts;
  const estMin = estMinutes(series);

  return (
    <View testID="sprint-effort-canvas" style={{ gap: spacing[3] }}>
      {/* En-tête : KPIs haute intensité */}
      <View testID="sprint-canvas-summary">
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.semibold,
            fontSize: typography.body.fontSize,
          }}
        >
          Volume haute intensité : {volStr}
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          · {sprintCount} sprints · ~{estMin} min
        </Text>
      </View>

      {/* Échauffement */}
      <WarmupCooldownBar
        testID="warmup-bar"
        icon="activity"
        title={warmup.name}
        subtitle={warmup.notes}
        onEditNotes={(notes) => commit(series, { ...warmup, notes }, cooldown)}
      />

      {/* Séries */}
      {series.map((group, gi) => (
        <SeriesCard
          key={group.key}
          group={group}
          index={gi}
          total={series.length}
          onPatchGroup={(patch) => patchGroup(gi, patch)}
          onPatchSerieParam={(patch) => patchSerieParam(gi, patch)}
          onPatchSprint={(bi, patch) => patchSprint(gi, bi, patch)}
          onAddSprint={() => addSprint(gi)}
          onRemoveSprint={(bi) => removeSprint(gi, bi)}
          onApplyPreset={(key) => applyPreset(gi, key)}
          onMoveUp={() => moveSerie(gi, -1)}
          onMoveDown={() => moveSerie(gi, 1)}
          onDelete={() => removeSerie(gi)}
        />
      ))}

      {/* Retour au calme */}
      <WarmupCooldownBar
        testID="cooldown-bar"
        icon="wind"
        title={cooldown.name}
        subtitle={cooldown.notes}
        onEditNotes={(notes) => commit(series, warmup, { ...cooldown, notes })}
      />

      <Button
        testID="sprint-add-series"
        variant="secondary"
        leftIcon={<Feather name="plus" size={18} color={colors.textPrimary} />}
        onPress={addSerie}
      >
        Ajouter une série
      </Button>
    </View>
  );
}

// ---------- Barre Échauffement / Retour au calme --------------------------------------------

function WarmupCooldownBar({
  icon,
  title,
  subtitle,
  onEditNotes,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  onEditNotes: (notes: string) => void;
  testID?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { colors, typography, spacing, radius, borderWidth } = useTheme();

  return (
    <View
      testID={testID}
      style={{
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      <Pressable
        testID={testID ? `${testID}-toggle` : undefined}
        onPress={() => setExpanded((v) => !v)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[3],
          padding: spacing[3],
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <Feather name={icon} size={18} color={colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {title}
          </Text>
          {!expanded && (
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.caption.fontSize,
              }}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          )}
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-right'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={{ paddingHorizontal: spacing[3], paddingBottom: spacing[3] }}>
          <TextInput
            value={subtitle}
            onChangeText={onEditNotes}
            multiline
            placeholder="Description du bloc…"
            placeholderTextColor={colors.textMuted}
            style={{
              minHeight: 64,
              paddingHorizontal: spacing[3],
              paddingVertical: spacing[2],
              borderRadius: radius.sm,
              borderWidth: borderWidth.hairline,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surface,
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
              textAlignVertical: 'top',
            }}
          />
        </View>
      )}
    </View>
  );
}

// ---------- Carte de série ------------------------------------------------------------------

function SeriesCard({
  group,
  index,
  total,
  onPatchGroup,
  onPatchSerieParam,
  onPatchSprint,
  onAddSprint,
  onRemoveSprint,
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
  onPatchSprint: (bi: number, patch: Record<string, string>) => void;
  onAddSprint: () => void;
  onRemoveSprint: (bi: number) => void;
  onApplyPreset: (key: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { colors, typography, spacing, radius } = useTheme();
  const tid = `series-card-${index}`;
  const { intensityMode, startType, flyingZone, rounds, restR } = serieProps(group);

  return (
    <Card testID={tid}>
      {/* En-tête : tile ×N + kicker + summary + contrôles d'ordre */}
      <Pressable
        onPress={() => setCollapsed((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
        accessibilityRole="button"
        accessibilityState={{ expanded: !collapsed }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.sm,
            backgroundColor: colors.accentSubtle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.semibold,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            ×{rounds}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.caption.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Série {index + 1}
          </Text>
          <Text
            testID={`${tid}-summary`}
            numberOfLines={1}
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.caption.fontSize,
            }}
          >
            {serieSummary(group)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          <SmallIconBtn
            testID={`${tid}-up`}
            icon="arrow-up"
            label="Monter la série"
            disabled={index === 0}
            onPress={onMoveUp}
          />
          <SmallIconBtn
            testID={`${tid}-down`}
            icon="arrow-down"
            label="Descendre la série"
            disabled={index === total - 1}
            onPress={onMoveDown}
          />
          {total > 1 && (
            <SmallIconBtn
              testID={`${tid}-del`}
              icon="x"
              label="Supprimer la série"
              tone="danger"
              onPress={onDelete}
            />
          )}
        </View>
        <Feather
          name={collapsed ? 'chevron-right' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {!collapsed && (
        <View style={{ gap: spacing[4], marginTop: spacing[4] }}>
          {/* Modèle + séries + récup R */}
          <View
            style={{
              flexDirection: 'row',
              gap: spacing[3],
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <View style={{ flex: 1, minWidth: 130 }}>
              <FieldLabel>Modèle</FieldLabel>
              <PresetPicker testID={`${tid}-preset`} onSelect={onApplyPreset} />
            </View>
            <View>
              <FieldLabel>Séries</FieldLabel>
              <Stepper
                testID={`${tid}-rounds`}
                value={rounds}
                min={1}
                max={20}
                onValueChange={(v) => onPatchGroup({ rounds: String(v) })}
                accessibilityLabel="Nombre de séries"
              />
            </View>
            <View>
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

          {/* Tableau des sprints */}
          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: spacing[2],
              }}
            >
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
                Sprints de la série
              </Text>
              <Pressable
                testID={`${tid}-add-sprint`}
                onPress={onAddSprint}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
                accessibilityRole="button"
                accessibilityLabel="Ajouter un sprint"
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

            {/* En-têtes colonnes */}
            <View style={{ flexDirection: 'row', gap: spacing[2], marginBottom: spacing[1] }}>
              <Text style={[colHeaderStyle, { width: 20, color: colors.textMuted }]}>#</Text>
              <Text style={[colHeaderStyle, { flex: 1, color: colors.textMuted }]}>Distance</Text>
              <Text style={[colHeaderStyle, { flex: 1, color: colors.textMuted }]}>Intensité</Text>
              <Text style={[colHeaderStyle, { flex: 1, color: colors.textMuted }]}>Récup r</Text>
              <View style={{ width: 24 }} />
            </View>

            {group.items.map((block, bi) => (
              <SprintRow
                key={block.key}
                block={block}
                index={bi}
                isLast={bi === group.items.length - 1}
                canDelete={group.items.length > 1}
                intensityMode={intensityMode}
                onPatch={(patch) => onPatchSprint(bi, patch)}
                onDelete={() => onRemoveSprint(bi)}
                testIDPrefix={`${tid}-sprint-${bi}`}
              />
            ))}
          </View>

          {/* Référentiel d'intensité */}
          <View style={{ gap: spacing[2] }}>
            <FieldLabel>Référentiel d'intensité</FieldLabel>
            <SegmentedControl
              testIDPrefix={`${tid}-imode`}
              options={INTENSITY_MODES}
              selected={intensityMode}
              onSelect={(v) => onPatchSerieParam({ intensityMode: v })}
            />
            <IntensityNote intensityMode={intensityMode} />
          </View>

          {/* Départ + zone d'élan */}
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
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[3],
                marginTop: spacing[1],
              }}
            >
              <SwitchToggle
                testID={`${tid}-flying`}
                value={flyingZone}
                onValueChange={(v) => onPatchSerieParam({ flyingZone: v ? 'true' : 'false' })}
              />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Zone d'élan (départ lancé)
              </Text>
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}

// ---------- Rangée sprint -------------------------------------------------------------------

function SprintRow({
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
  const { colors, typography, spacing } = useTheme();
  const intensityUnit =
    intensityMode === 'percent_record' ? '%' : intensityMode === 'speed' ? 'm/s' : 's';

  return (
    <View
      testID={testIDPrefix}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        marginBottom: spacing[2],
      }}
    >
      {/* Numéro */}
      <Text
        style={{
          width: 20,
          textAlign: 'center',
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.caption.fontSize,
        }}
      >
        {index + 1}
      </Text>

      {/* Distance */}
      <CellInput
        testID={`${testIDPrefix}-dist`}
        value={block.params.distanceMeters ?? ''}
        onChangeText={(t) => onPatch({ distanceMeters: t })}
        unit="m"
      />

      {/* Intensité */}
      <CellInput
        testID={`${testIDPrefix}-int`}
        value={block.params.intensityValue ?? ''}
        onChangeText={(t) => onPatch({ intensityValue: t })}
        unit={intensityUnit}
        decimal={intensityMode !== 'percent_record'}
      />

      {/* Récup r — dernier sprint : → R (réupération de série), sinon saisie en min */}
      {isLast ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
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
      )}

      {canDelete ? (
        <Pressable
          testID={`${testIDPrefix}-del`}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel="Supprimer ce sprint"
          hitSlop={8}
          style={{ width: 24, alignItems: 'center' }}
        >
          <Feather name="x" size={15} color={colors.danger} />
        </Pressable>
      ) : (
        <View style={{ width: 24 }} />
      )}
    </View>
  );
}

// ---------- Note d'intensité ----------------------------------------------------------------

function IntensityNote({ intensityMode }: { intensityMode: string }) {
  const { colors, typography, spacing } = useTheme();
  const note =
    intensityMode === 'percent_record'
      ? 'Cible individualisée · % du record de la distance de chaque sprint.'
      : intensityMode === 'speed'
        ? 'Vitesse cible en m/s · mesurée par radar ou GPS.'
        : 'Temps cible absolu, commun à tous les athlètes.';

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing[2],
        backgroundColor: colors.warningBg,
        borderRadius: 8,
        padding: spacing[3],
      }}
    >
      <Feather name="info" size={14} color={colors.warning} />
      <Text
        style={{
          flex: 1,
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.caption.fontSize,
        }}
      >
        {note}
      </Text>
    </View>
  );
}

// ---------- Primitives locales --------------------------------------------------------------

/** Contrôle segmenté — référentiel d'intensité (3 options). */
function SegmentedControl({
  options,
  selected,
  onSelect,
  testIDPrefix,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
  testIDPrefix: string;
}) {
  const { colors, typography, radius, borderWidth } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      {options.map((opt, i) => {
        const sel = selected === opt.value;
        return (
          <Pressable
            key={opt.value}
            testID={`${testIDPrefix}-${opt.value}`}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            style={({ pressed }) => ({
              flex: 1,
              height: 36,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sel ? colors.accentSubtle : pressed ? colors.surface : 'transparent',
              borderLeftWidth: i > 0 ? borderWidth.hairline : 0,
              borderLeftColor: colors.borderStrong,
            })}
          >
            <Text
              style={{
                color: sel ? colors.accentText : colors.textSecondary,
                fontFamily: sel ? typography.fontFamily.semibold : typography.fontFamily.regular,
                fontSize: typography.caption.fontSize,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bascule on/off pour la zone d'élan. */
function SwitchToggle({
  value,
  onValueChange,
  testID,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
}) {
  const { colors, radius } = useTheme();
  const W = 44;
  const H = 26;
  const KNOB = 20;
  const PAD = (H - KNOB) / 2;
  return (
    <Pressable
      testID={testID}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      style={{
        width: W,
        height: H,
        borderRadius: radius.pill,
        backgroundColor: value ? colors.accent : colors.borderStrong,
        justifyContent: 'center',
        paddingHorizontal: PAD,
      }}
    >
      <View
        style={{
          width: KNOB,
          height: KNOB,
          borderRadius: KNOB / 2,
          backgroundColor: colors.textPrimary,
          alignSelf: value ? 'flex-end' : 'flex-start',
        }}
      />
    </Pressable>
  );
}

/** Sélecteur de preset en liste déroulante. */
function PresetPicker({ onSelect, testID }: { onSelect: (key: string) => void; testID?: string }) {
  const [open, setOpen] = useState(false);
  const { colors, typography, spacing, radius, borderWidth } = useTheme();

  if (!open) {
    return (
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={{
          height: 42,
          paddingHorizontal: spacing[3],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: radius.sm,
          borderWidth: borderWidth.hairline,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surfaceSunken,
          gap: spacing[2],
        }}
      >
        <Text
          style={{
            flex: 1,
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
          numberOfLines={1}
        >
          Choisir un modèle…
        </Text>
        <Feather name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>
    );
  }

  return (
    <View
      style={{
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.accent,
        backgroundColor: colors.surface,
        overflow: 'hidden',
      }}
    >
      {SPRINT_PRESETS_UI.map((p) => (
        <Pressable
          key={p.key}
          onPress={() => {
            onSelect(p.key);
            setOpen(false);
          }}
          style={({ pressed }) => ({
            paddingHorizontal: spacing[3],
            paddingVertical: spacing[2],
            backgroundColor: pressed ? colors.accentSubtle : 'transparent',
          })}
        >
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {p.label}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => setOpen(false)}
        style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[2] }}
      >
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Annuler
        </Text>
      </Pressable>
    </View>
  );
}

/** Libellé de section. */
function FieldLabel({ children }: { children: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Text
      style={{
        marginBottom: spacing[1],
        color: colors.textSecondary,
        fontFamily: typography.fontFamily.medium,
        fontSize: typography.caption.fontSize,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

const colHeaderStyle = {
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};

/** Cellule numérique du tableau de sprints (distance / intensité / récup). */
function CellInput({
  value,
  onChangeText,
  unit,
  decimal = false,
  testID,
}: {
  value: string;
  onChangeText: (t: string) => void;
  unit: string;
  decimal?: boolean;
  testID?: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing[2],
        height: 38,
        gap: spacing[1],
      }}
    >
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType={decimal ? 'numeric' : 'number-pad'}
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
          textAlign: 'right',
        }}
        placeholderTextColor={colors.textMuted}
      />
      <Text
        style={{
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.caption.fontSize,
          minWidth: unit.length > 2 ? 30 : 16,
        }}
      >
        {unit}
      </Text>
    </View>
  );
}

/** Entrée numérique avec unité pour les champs hors tableau (récup R). */
function InlineNumberInput({
  value,
  onChangeText,
  unit,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (t: string) => void;
  unit: string;
  placeholder?: string;
  testID?: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 42,
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceSunken,
        paddingHorizontal: spacing[2],
        gap: spacing[1],
        minWidth: 80,
      }}
    >
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
          textAlign: 'right',
          minWidth: 36,
        }}
      />
      <Text
        style={{
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.caption.fontSize,
        }}
      >
        {unit}
      </Text>
    </View>
  );
}

/** Bouton icône compact (contrôles d'ordre / suppression de série). */
function SmallIconBtn({
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
  const { colors, opacity } = useTheme();
  const color = tone === 'danger' ? colors.danger : colors.textSecondary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ opacity: disabled ? opacity.disabled : 1, padding: 4 }}
    >
      <Feather name={icon} size={16} color={color} />
    </Pressable>
  );
}
