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
import { SPRINT_PRESETS } from './assistant-presets';
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
  RECOVERY_TYPES,
  SegmentedControl,
  SeriesCardFrame,
  SwitchToggle,
  WarmupCooldownBar,
  formatMinutes,
  splitEffortNodes,
} from './effort-card-shared';

// Re-exports pour les consommateurs existants (tests, assistant-presets).
export { makeWarmupBlock, makeCooldownBlock };

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

// ---------- Helpers -------------------------------------------------------------------------

/** Propriétés partagées d'une série, lues depuis le premier sprint du groupe. */
function serieProps(group: EditableGroup) {
  const first = group.items[0];
  return {
    intensityMode: first?.params.intensityMode ?? 'percent_record',
    startType: first?.params.startType ?? 'blocks',
    flyingZone: first?.params.flyingZone === 'true',
    // ADR-39 §6 — récup r active/passive. Défaut `passive` (maquette) : une série héritée d'avant
    // la bascule (param absent) s'affiche donc « Passive », ce que la valeur posée à la création
    // rend cohérent pour toute série produite par la carte.
    recoveryType: first?.params.recoveryType ?? 'passive',
    rounds: Math.max(1, Number(group.rounds) || 1),
    restR: Math.max(0, Number(group.restBetweenRoundsSeconds) || 0),
  };
}

/**
 * Clé du modèle dont la série amorcée correspond (match par **nom de série**), pour pré-sélectionner
 * le sélecteur de modèle. `''` si aucune correspondance (séance custom / éditée) → « Choisir… ».
 * Sûr pour l'édition : une séance existante qui ne matche aucun preset n'est jamais pré-sélectionnée.
 */
function matchPresetKey(group: EditableGroup): string {
  for (const p of SPRINT_PRESETS) {
    const g = p.build().find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (g && g.name === group.name) return p.key;
  }
  return '';
}

/** Résumé condensé d'une série pour la tuile réduite. */
function serieSummary(group: EditableGroup): string {
  const { intensityMode, startType, rounds, restR } = serieProps(group);
  const dists = group.items.map((b) => b.params.distanceMeters ?? '?').join('·');
  // Intensités réellement saisies (> 0) : sans filtre, des champs vides donnaient « 0 % » (TLX-172 #7).
  const vals = group.items.map((b) => Number(b.params.intensityValue) || 0).filter((v) => v > 0);
  const unit = intensityMode === 'percent_record' ? '%' : intensityMode === 'speed' ? ' m/s' : ' s';
  const intStr =
    vals.length === 0
      ? '—'
      : Math.min(...vals) === Math.max(...vals)
        ? `${Math.min(...vals)}${unit}`
        : `${Math.min(...vals)}→${Math.max(...vals)}${unit}`;
  const startLabel =
    START_TYPES.find((s) => s.value === startType)?.label.toLowerCase() ?? startType;
  return `${rounds} × (${dists} m) · ${startLabel} · ${intStr} · R ${formatMinutes(restR)}`;
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
  recoveryType: string;
}): EditableBlock {
  const d = opts.distance ?? 60;
  return makeBlock({
    type: BlockType.sprint,
    name: `${d} m`,
    params: {
      reps: '1',
      distanceMeters: String(d),
      recoverySeconds: String(opts.recovery ?? 240),
      recoveryType: opts.recoveryType,
      intensityMode: opts.intensityMode,
      intensityValue: String(opts.intensity ?? 95),
      startType: opts.startType,
      flyingZone: opts.flyingZone ? 'true' : 'false',
    },
  });
}

// ---------- Canvas principal ----------------------------------------------------------------

export function SprintEffortCanvas({
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
        const { intensityMode, startType, flyingZone, recoveryType } = serieProps(g);
        const last = g.items[g.items.length - 1];
        const newSprint = makeSprintBlock({
          distance: Number(last?.params.distanceMeters) || 60,
          intensity: Number(last?.params.intensityValue) || 95,
          recovery: 240,
          intensityMode,
          startType,
          flyingZone,
          recoveryType,
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
    // Une série ajoutée part du 1er preset (Départs / Accélération) → un modèle est sélectionné
    // par défaut (match par nom), comme l'amorce de l'assistant.
    const preset = SPRINT_PRESETS[0]?.build().find((n) => isEditableGroup(n)) as
      | EditableGroup
      | undefined;
    commit([
      ...series,
      preset ??
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
              recoveryType: 'passive',
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
    const preset = SPRINT_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const built = preset.build();
    const builtGroup = built.find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (!builtGroup) return;
    commit(
      series.map((g, i) => {
        if (i !== gi) return g;
        // Préserve la clé pour ne pas re-monter la carte (conserve l'état réduit/développé).
        return { ...builtGroup, key: g.key };
      }),
    );
  }

  // KPIs haute intensité (hors échauffement/RAC)
  const kpis = sessionKpis(nodesToItems(series));
  const volStr = formatDistanceVolume(kpis.distanceMeters) ?? '0 m';

  return (
    <EffortCanvasShell
      testID="sprint-effort-canvas"
      header={
        embedded ? undefined : (
          <CanvasKpiHeader
            testID="sprint-canvas-summary"
            title={`Volume haute intensité : ${volStr}`}
            subtitle={`· ${kpis.efforts} sprints · ~${estMinutes(series)} min`}
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
            durationSeconds={warmup.durationSeconds}
            onEditNotes={(notes) => commit(series, { ...warmup, notes }, cooldown)}
            onEditDurationSeconds={(durationSeconds) =>
              commit(series, { ...warmup, durationSeconds }, cooldown)
            }
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
            durationSeconds={cooldown.durationSeconds}
            onEditNotes={(notes) => commit(series, warmup, { ...cooldown, notes })}
            onEditDurationSeconds={(durationSeconds) =>
              commit(series, warmup, { ...cooldown, durationSeconds })
            }
          />
        )
      }
      onAddSeries={addSerie}
      addSeriesTestID="sprint-add-series"
    >
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
    </EffortCanvasShell>
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
  // Pré-sélection : si la série amorcée correspond à un modèle (cas assistant), on l'affiche
  // sélectionné. Dérivé une seule fois au montage (les choix ultérieurs pilotent l'état).
  const [selectedPresetKey, setSelectedPresetKey] = useState(() => matchPresetKey(group));
  const { colors, typography, spacing } = useTheme();
  const tid = `series-card-${index}`;
  const { intensityMode, startType, flyingZone, recoveryType, rounds, restR } = serieProps(group);

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
      {/* Modèle : pleine largeur, sur sa propre rangée — le sélecteur déroulant se déploie
          alors sans décaler « Tours »/« Récup » (qui partageaient sa rangée auparavant). */}
      <View>
        <FieldLabel>Modèle</FieldLabel>
        <PresetPicker
          testID={`${tid}-preset`}
          presets={SPRINT_PRESETS}
          selectedKey={selectedPresetKey}
          onSelect={(key) => {
            setSelectedPresetKey(key);
            onApplyPreset(key);
          }}
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
            placeholder="0"
            unit="min"
          />
        </View>
      </View>

      {/* Tableau des sprints */}
      <EffortTable
        title="Sprints de la série"
        onAddRow={onAddSprint}
        addRowTestID={`${tid}-add-sprint`}
        columns={[{ label: 'Distance' }, { label: 'Intensité' }, { label: 'Récup r', width: 72 }]}
      >
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
      </EffortTable>

      {/* Type de récup r — qualifie la colonne « Récup r » du tableau ci-dessus (ADR-39 §5 :
          « Récup r — chips + bascule passive/active »). Propriété partagée de la série, portée
          par les params de chaque sprint du groupe comme départ / référentiel d'intensité. */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Type de récup. r</FieldLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {RECOVERY_TYPES.map((r) => (
            <Chip
              key={r.value}
              testID={`${tid}-rectype-${r.value}`}
              selected={recoveryType === r.value}
              onPress={() => onPatchSerieParam({ recoveryType: r.value })}
            >
              {r.label}
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
          // Changer de référentiel **réinitialise** la valeur d'intensité : un « 95 » en % record
          // n'a aucun sens en s ou en m/s, et la conversion dépend du record de chaque athlète
          // (impossible ici). On vide pour que le coach saisisse la valeur dans la bonne unité.
          onSelect={(v) => {
            if (v === intensityMode) return;
            onPatchSerieParam({ intensityMode: v, intensityValue: '' });
          }}
        />
        <InfoNote>{intensityNote(intensityMode)}</InfoNote>
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
    </SeriesCardFrame>
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
  const { colors, typography } = useTheme();
  const intensityUnit =
    intensityMode === 'percent_record' ? '%' : intensityMode === 'speed' ? 'm/s' : 's';

  return (
    <EffortRowFrame
      testID={testIDPrefix}
      index={index}
      canDelete={canDelete}
      onDelete={onDelete}
      deleteLabel="Supprimer ce sprint"
    >
      <CellInput
        testID={`${testIDPrefix}-dist`}
        value={block.params.distanceMeters ?? ''}
        onChangeText={(t) => onPatch({ distanceMeters: t })}
        unit="m"
      />
      <CellInput
        testID={`${testIDPrefix}-int`}
        value={block.params.intensityValue ?? ''}
        onChangeText={(t) => onPatch({ intensityValue: t })}
        unit={intensityUnit}
        decimal={intensityMode !== 'percent_record'}
      />
      {/* Récup r — dernier sprint : → R (récupération de série), sinon saisie en min */}
      {/* Colonne « récup » à largeur fixe (72) pour toutes les lignes → la dernière (« → R »)
          s'aligne exactement avec les lignes à saisie (sinon décalage, react-native-web ne fait
          pas grandir une cellule texte comme une CellInput). */}
      {isLast ? (
        <View style={{ width: 72, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Text
            style={{
              color: colors.textSecondary,
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

/** Note du référentiel d'intensité selon le mode. */
function intensityNote(intensityMode: string): string {
  return intensityMode === 'percent_record'
    ? 'Cible individualisée · % du record de la distance de chaque sprint.'
    : intensityMode === 'speed'
      ? 'Vitesse cible en m/s · mesurée par radar ou GPS.'
      : 'Temps cible absolu, commun à tous les athlètes.';
}
