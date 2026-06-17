import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { BlockType, LoadUnit } from '@talent-x/api-client';
import { Stepper } from '../components/ui';
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
import { EXERCISE_LABELS, STRENGTH_PRESETS, targetLoadFromOneRm } from './assistant-presets';
import { formatTonnage, sessionTonnage } from '../sessions/session-summary';
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
  splitEffortNodes,
} from './effort-card-shared';

// Re-exports pour les consommateurs existants (tests).
export { makeWarmupBlock, makeCooldownBlock };

/**
 * Canvas Renforcement / PPG (ADR-41, TLX-173). Structure : Échauffement · cartes de série ·
 * Retour au calme · + ajouter, comme les 5 autres cartes athlé.
 *
 * MODÈLE DE DONNÉES — décision phase B (conforme ADR-41, qui n'impose pas la forme de stockage,
 * « la carte série est un regroupement visuel ») : on **conserve le choix de la phase A** —
 *  - **Muscu** : chaque exercice est un bloc `strength` **de premier niveau** (non groupé), son
 *    `sets` propre reste visible (ADR-27 règle 6 masque `sets` dans un groupe ; or les séries
 *    varient par exercice). Une « carte de série » Muscu = un **segment contigu** de blocs
 *    `strength` top-level.
 *  - **PPG** : un `EditableGroup` (`groupType:'circuit'`) de stations `core`, tours = `rounds`.
 *
 * La carte partitionne donc le canvas plat en **segments ordonnés** (un segment = un run de blocs
 * `strength` top-level → carte Muscu, ou un groupe `core` → carte PPG) et reconstruit la liste
 * plate à chaque commit → round-trip C-05 garanti, `sessionTonnage` lit `sets` directement (kg)
 * ou enrichit le %1RM ici via `ONE_RM_REFERENCE`. Le segmented Mode remappe `strength` ↔ `core`
 * (même mécanique que Endurance `endurance` ↔ `interval`). Zéro changement de contrat.
 */

// ---------- Référence données ----------------------------------------------------------------

const MODES = [
  { value: 'muscu', label: 'Muscu' },
  { value: 'ppg', label: 'PPG / Circuit' },
];

const LOAD_MODES = [
  { value: 'percent_1rm', label: '% 1RM' },
  { value: 'kg', label: 'kg' },
  { value: 'bodyweight', label: 'Poids de corps' },
  { value: 'rpe', label: 'RPE' },
];

/** Astuce coach contextuelle par méthode (preset), affichée en `InfoNote`. */
const PRESET_TIPS: Record<string, string> = {
  force_max: 'Force max : charges lourdes (85–95 % 1RM), séries courtes, récup longue (3–5′).',
  hypertrophy: 'Hypertrophie : 65–75 % 1RM, 8–12 reps, récup ~90″, tempo contrôlé.',
  power: 'Force-vitesse : charges modérées (40–60 % 1RM) exécutées de façon explosive.',
  plyo: 'Pliométrie : poids de corps, qualité des appuis et du gainage avant le volume.',
  circuit_ppg: 'Circuit PPG : enchaîner les stations, récup courte, intensité maîtrisée.',
  core_ppg: 'Gainage : tenir la posture, ne pas relâcher le bassin, respirer régulièrement.',
};

/** Clé sentinelle « Autre exercice… » : exercice libre saisi à la main (pas de clé catalogue). */
const CUSTOM_EXERCISE_KEY = '__custom__';

/** Options d'exercices Muscu (clés `ONE_RM_REFERENCE`/`EXERCISE_LABELS`) + entrée libre. */
const EXERCISE_OPTIONS = [
  ...Object.keys(EXERCISE_LABELS).map((key) => ({ value: key, label: EXERCISE_LABELS[key] })),
  { value: CUSTOM_EXERCISE_KEY, label: 'Autre exercice…' },
];

/** Un bloc est en mode « Autre » si son `exerciseKey` est absent ou hors catalogue. */
function isCustomExercise(block: EditableBlock): boolean {
  const key = block.params.exerciseKey;
  return key == null || key === '' || EXERCISE_LABELS[key] == null;
}

// ---------- Modèle de séries (segments du canvas plat) --------------------------------------

type MuscuSeries = { kind: 'muscu'; key: string; blocks: EditableBlock[] };
type PpgSeries = { kind: 'ppg'; key: string; group: EditableGroup };
type Series = MuscuSeries | PpgSeries;

/** Partitionne séries (hors warmup/cooldown) en segments : run de `strength` top-level, ou groupe. */
function toSeries(nodes: EditableNode[]): Series[] {
  const out: Series[] = [];
  let run: EditableBlock[] = [];
  const flush = () => {
    if (run.length > 0) {
      out.push({ kind: 'muscu', key: run[0].key, blocks: run });
      run = [];
    }
  };
  for (const node of nodes) {
    if (isEditableGroup(node)) {
      flush();
      out.push({ kind: 'ppg', key: node.key, group: node });
    } else if (node.type === BlockType.strength || node.type === BlockType.core) {
      run.push(node);
    }
  }
  flush();
  return out;
}

/** Reconstruit la liste plate des nœuds (hors warmup/cooldown) depuis les segments. */
function fromSeries(series: Series[]): EditableNode[] {
  const nodes: EditableNode[] = [];
  for (const s of series) {
    if (s.kind === 'muscu') nodes.push(...s.blocks);
    else nodes.push(s.group);
  }
  return nodes;
}

// ---------- Lecture défensive des propriétés ------------------------------------------------

/** Mode de charge d'un bloc Muscu (dérivé : `loadUnit` si posé, sinon `rpe` si `params.rpe`). */
function loadModeOf(block: EditableBlock): string {
  if (block.loadUnit === LoadUnit.kg) return 'kg';
  if (block.loadUnit === LoadUnit.bodyweight) return 'bodyweight';
  if (block.loadUnit === LoadUnit.percent_1rm) return 'percent_1rm';
  if (block.params.rpe != null && block.params.rpe !== '') return 'rpe';
  return 'percent_1rm';
}

function muscuLoadMode(s: MuscuSeries): string {
  return s.blocks[0] ? loadModeOf(s.blocks[0]) : 'percent_1rm';
}

function ppgRounds(group: EditableGroup): number {
  return Math.max(1, Number(group.rounds) || 1);
}

// ---------- Fabriques ------------------------------------------------------------------------

function makeMuscuBlock(opts: {
  exerciseKey: string;
  sets: number;
  reps: number;
  loadMode: string;
  loadValue?: string;
}): EditableBlock {
  const block = makeBlock({
    type: BlockType.strength,
    name: EXERCISE_LABELS[opts.exerciseKey] ?? opts.exerciseKey,
    sets: String(opts.sets),
    reps: String(opts.reps),
    params: { exerciseKey: opts.exerciseKey },
  });
  applyLoadMode(block, opts.loadMode, opts.loadValue);
  return block;
}

/** Applique un mode de charge à un bloc (mute la copie passée). */
function applyLoadMode(block: EditableBlock, mode: string, value?: string) {
  if (mode === 'rpe') {
    block.loadUnit = null;
    block.loadValue = '';
    block.params = { ...block.params, rpe: value ?? block.params.rpe ?? '8' };
  } else if (mode === 'bodyweight') {
    block.loadUnit = LoadUnit.bodyweight;
    block.loadValue = '';
    const { rpe: _rpe, ...rest } = block.params;
    block.params = rest;
  } else {
    block.loadUnit = mode === 'kg' ? LoadUnit.kg : LoadUnit.percent_1rm;
    if (value != null) block.loadValue = value;
    const { rpe: _rpe, ...rest } = block.params;
    block.params = rest;
  }
}

function defaultMuscuSeries(): EditableBlock[] {
  return [
    makeMuscuBlock({
      exerciseKey: 'squat',
      sets: 4,
      reps: 5,
      loadMode: 'percent_1rm',
      loadValue: '85',
    }),
  ];
}

function makePpgStation(name = 'Station'): EditableBlock {
  return makeBlock({ type: BlockType.core, name, durationSeconds: '40', restSeconds: '20' });
}

function defaultPpgGroup(): EditableGroup {
  return makeSeriesGroup({
    name: 'Circuit PPG',
    groupType: 'circuit',
    rounds: '3',
    restBetweenRoundsSeconds: '60',
    items: [makePpgStation('Squats sautés'), makePpgStation('Pompes')],
  });
}

// ---------- Résumés / KPI --------------------------------------------------------------------

/**
 * Tonnage de la séance : kg explicites (`sessionTonnage`) + enrichissement %1RM via
 * `ONE_RM_REFERENCE` (résolu ici, comme prévu ADR-41 §5). Repli volume de reps si rien en kg.
 */
function tonnageBadge(series: Series[]): string {
  const items = nodesToItems(fromSeries(series));
  const base = sessionTonnage(items);
  let kg = base.tonnageKg;
  for (const s of series) {
    if (s.kind !== 'muscu') continue;
    for (const b of s.blocks) {
      if (b.loadUnit !== LoadUnit.percent_1rm) continue;
      const sets = Number(b.sets) || 0;
      const reps = Number(b.reps) || 0;
      const target = targetLoadFromOneRm(b.params.exerciseKey ?? '', Number(b.loadValue) || 0);
      if (target != null) kg += sets * reps * target;
    }
  }
  const t = formatTonnage(Math.round(kg));
  if (t) return t;
  return base.repVolume > 0 ? `${base.repVolume} reps` : '0 reps';
}

function muscuSummary(s: MuscuSeries): string {
  const parts = s.blocks.map((b) => {
    const label = EXERCISE_LABELS[b.params.exerciseKey ?? ''] ?? (b.name || 'Exercice');
    const sets = Number(b.sets) || 0;
    const reps = Number(b.reps) || 0;
    return `${label} ${sets}×${reps}`;
  });
  return parts.length > 0 ? parts.join(' · ') : 'Aucun exercice';
}

function ppgSummary(group: EditableGroup): string {
  const rounds = ppgRounds(group);
  return `${rounds} tour${rounds > 1 ? 's' : ''} × ${group.items.length} station${
    group.items.length > 1 ? 's' : ''
  }`;
}

function estMinutes(series: Series[]): number {
  let sec = 0;
  for (const s of series) {
    if (s.kind === 'muscu') {
      for (const b of s.blocks) {
        const sets = Number(b.sets) || 0;
        const reps = Number(b.reps) || 0;
        sec += sets * (reps * 4 + 120); // ≈4 s/rep + ~2 min récup/série
      }
    } else {
      const rounds = ppgRounds(s.group);
      const perRound = s.group.items.reduce((a, b) => {
        const work = Number(b.durationSeconds) || (Number(b.reps) || 0) * 3;
        return a + work + (Number(b.restSeconds) || 0);
      }, 0);
      const restR = Number(s.group.restBetweenRoundsSeconds) || 0;
      sec += rounds * perRound + (rounds - 1) * restR;
    }
  }
  return Math.round(sec / 60);
}

// ---------- Canvas principal ----------------------------------------------------------------

export function StrengthEffortCanvas({
  nodes,
  onChange,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
}) {
  const { warmup, cooldown } = splitEffortNodes(
    nodes,
    BlockType.warmup,
    BlockType.cooldown,
    makeWarmupBlock,
    makeCooldownBlock,
  );
  const significant = nodes.filter(
    (n) => isEditableGroup(n) || (n.type !== BlockType.warmup && n.type !== BlockType.cooldown),
  );
  const series = toSeries(significant);

  function commit(
    newSeries: Series[],
    newWarmup: EditableBlock = warmup,
    newCooldown: EditableBlock = cooldown,
  ) {
    onChange([newWarmup, ...fromSeries(newSeries), newCooldown]);
  }

  function patchSeries(si: number, next: Series) {
    commit(series.map((s, i) => (i === si ? next : s)));
  }

  /** Bascule le mode d'une carte : remappe le type des lignes (strength ↔ core). */
  function setMode(si: number, mode: string) {
    const cur = series[si];
    if (mode === 'ppg' && cur.kind === 'muscu') {
      const stations = cur.blocks.map((b) =>
        makeBlock({
          type: BlockType.core,
          name: EXERCISE_LABELS[b.params.exerciseKey ?? ''] ?? (b.name || 'Station'),
          durationSeconds: '40',
          restSeconds: '20',
        }),
      );
      patchSeries(si, {
        kind: 'ppg',
        key: cur.key,
        group: makeSeriesGroup({
          name: 'Circuit PPG',
          groupType: 'circuit',
          rounds: '3',
          restBetweenRoundsSeconds: '60',
          items: stations.length > 0 ? stations : [makePpgStation()],
        }),
      });
    } else if (mode === 'muscu' && cur.kind === 'ppg') {
      const blocks = cur.group.items.map((b, idx) =>
        makeMuscuBlock({
          exerciseKey: EXERCISE_OPTIONS[idx % EXERCISE_OPTIONS.length].value,
          sets: 4,
          reps: 8,
          loadMode: 'percent_1rm',
          loadValue: '70',
        }),
      );
      patchSeries(si, {
        kind: 'muscu',
        key: cur.key,
        blocks: blocks.length > 0 ? blocks : defaultMuscuSeries(),
      });
    }
  }

  function setLoadMode(si: number, mode: string) {
    const cur = series[si];
    if (cur.kind !== 'muscu') return;
    patchSeries(si, {
      ...cur,
      blocks: cur.blocks.map((b) => {
        const next = { ...b, params: { ...b.params } };
        applyLoadMode(next, mode);
        return next;
      }),
    });
  }

  function patchMuscuRow(si: number, bi: number, patch: Partial<EditableBlock>) {
    const cur = series[si];
    if (cur.kind !== 'muscu') return;
    patchSeries(si, {
      ...cur,
      blocks: cur.blocks.map((b, j) => (j === bi ? { ...b, ...patch } : b)),
    });
  }

  function setMuscuExercise(si: number, bi: number, exerciseKey: string) {
    const cur = series[si];
    if (cur.kind !== 'muscu') return;
    if (exerciseKey === CUSTOM_EXERCISE_KEY) {
      // « Autre » : on efface `exerciseKey` (plus de référence %1RM) et on laisse le coach
      // saisir le nom libre via le champ texte ; `name` vidé pour montrer le placeholder.
      const { exerciseKey: _drop, ...rest } = cur.blocks[bi].params;
      patchMuscuRow(si, bi, { name: '', params: rest });
      return;
    }
    patchMuscuRow(si, bi, {
      name: EXERCISE_LABELS[exerciseKey] ?? exerciseKey,
      params: { ...cur.blocks[bi].params, exerciseKey },
    });
  }

  function addMuscuExercise(si: number) {
    const cur = series[si];
    if (cur.kind !== 'muscu') return;
    const last = cur.blocks[cur.blocks.length - 1];
    const mode = last ? loadModeOf(last) : 'percent_1rm';
    patchSeries(si, {
      ...cur,
      blocks: [
        ...cur.blocks,
        makeMuscuBlock({
          exerciseKey: 'bench',
          sets: Number(last?.sets) || 4,
          reps: Number(last?.reps) || 8,
          loadMode: mode,
          loadValue: last?.loadValue || (mode === 'percent_1rm' ? '70' : '40'),
        }),
      ],
    });
  }

  function removeMuscuExercise(si: number, bi: number) {
    const cur = series[si];
    if (cur.kind !== 'muscu') return;
    const remaining = cur.blocks.filter((_, j) => j !== bi);
    patchSeries(si, { ...cur, blocks: remaining.length > 0 ? remaining : cur.blocks });
  }

  function patchPpgGroup(si: number, patch: Partial<EditableGroup>) {
    const cur = series[si];
    if (cur.kind !== 'ppg') return;
    patchSeries(si, { ...cur, group: { ...cur.group, ...patch } });
  }

  function patchPpgStation(si: number, bi: number, patch: Partial<EditableBlock>) {
    const cur = series[si];
    if (cur.kind !== 'ppg') return;
    patchSeries(si, {
      ...cur,
      group: {
        ...cur.group,
        items: cur.group.items.map((b, j) => (j === bi ? { ...b, ...patch } : b)),
      },
    });
  }

  function addPpgStation(si: number) {
    const cur = series[si];
    if (cur.kind !== 'ppg') return;
    patchSeries(si, {
      ...cur,
      group: { ...cur.group, items: [...cur.group.items, makePpgStation()] },
    });
  }

  function removePpgStation(si: number, bi: number) {
    const cur = series[si];
    if (cur.kind !== 'ppg') return;
    const remaining = cur.group.items.filter((_, j) => j !== bi);
    patchSeries(si, {
      ...cur,
      group: { ...cur.group, items: remaining.length > 0 ? remaining : cur.group.items },
    });
  }

  function applyPreset(si: number, presetKey: string) {
    const preset = STRENGTH_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    const built = preset.build();
    const cur = series[si];
    const group = built.find((n) => isEditableGroup(n)) as EditableGroup | undefined;
    if (group) {
      patchSeries(si, { kind: 'ppg', key: cur.key, group: { ...group, key: cur.key } });
    } else {
      const blocks = built.filter((n) => !isEditableGroup(n)) as EditableBlock[];
      patchSeries(si, {
        kind: 'muscu',
        key: cur.key,
        blocks: blocks.length > 0 ? blocks : defaultMuscuSeries(),
      });
    }
  }

  // Ajout d'un bloc : on insère un **groupe PPG** (toujours un nœud distinct → carte distincte).
  // Deux blocs de travail Muscu adjacents fusionneraient en une seule carte (runs `strength`
  // contigus, cf. modèle de données ci-dessus) ; passer par un groupe garantit une carte propre,
  // que l'utilisateur peut rebasculer en Muscu via le Mode.
  function addSerie() {
    commit([...series, { kind: 'ppg', key: `ppg-${series.length}`, group: defaultPpgGroup() }]);
  }

  function removeSerie(si: number) {
    if (series.length <= 1) return;
    commit(series.filter((_, i) => i !== si));
  }

  function moveSerie(si: number, dir: -1 | 1) {
    const j = si + dir;
    if (j < 0 || j >= series.length) return;
    const next = [...series];
    [next[si], next[j]] = [next[j], next[si]];
    commit(next);
  }

  return (
    <EffortCanvasShell
      testID="strength-effort-canvas"
      header={
        <CanvasKpiHeader
          testID="strength-canvas-summary"
          title={`${series.length} bloc${series.length > 1 ? 's' : ''} · ${tonnageBadge(series)}`}
          subtitle={`· ~${estMinutes(series)} min`}
        />
      }
      warmup={
        <WarmupCooldownBar
          testID="warmup-bar"
          icon="activity"
          title={warmup.name}
          subtitle={warmup.notes}
          onEditNotes={(notes) => commit(series, { ...warmup, notes }, cooldown)}
        />
      }
      cooldown={
        <WarmupCooldownBar
          testID="cooldown-bar"
          icon="wind"
          title={cooldown.name}
          subtitle={cooldown.notes}
          onEditNotes={(notes) => commit(series, warmup, { ...cooldown, notes })}
        />
      }
      onAddSeries={addSerie}
      addSeriesTestID="strength-add-series"
    >
      {series.map((s, si) => (
        <StrengthSeriesCard
          key={s.key}
          series={s}
          index={si}
          total={series.length}
          onSetMode={(m) => setMode(si, m)}
          onSetLoadMode={(m) => setLoadMode(si, m)}
          onPatchMuscuRow={(bi, patch) => patchMuscuRow(si, bi, patch)}
          onSetMuscuExercise={(bi, key) => setMuscuExercise(si, bi, key)}
          onAddMuscuExercise={() => addMuscuExercise(si)}
          onRemoveMuscuExercise={(bi) => removeMuscuExercise(si, bi)}
          onPatchPpgGroup={(patch) => patchPpgGroup(si, patch)}
          onPatchPpgStation={(bi, patch) => patchPpgStation(si, bi, patch)}
          onAddPpgStation={() => addPpgStation(si)}
          onRemovePpgStation={(bi) => removePpgStation(si, bi)}
          onApplyPreset={(key) => applyPreset(si, key)}
          onMoveUp={() => moveSerie(si, -1)}
          onMoveDown={() => moveSerie(si, 1)}
          onDelete={() => removeSerie(si)}
        />
      ))}
    </EffortCanvasShell>
  );
}

// ---------- Carte de série ------------------------------------------------------------------

function StrengthSeriesCard({
  series,
  index,
  total,
  onSetMode,
  onSetLoadMode,
  onPatchMuscuRow,
  onSetMuscuExercise,
  onAddMuscuExercise,
  onRemoveMuscuExercise,
  onPatchPpgGroup,
  onPatchPpgStation,
  onAddPpgStation,
  onRemovePpgStation,
  onApplyPreset,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  series: Series;
  index: number;
  total: number;
  onSetMode: (mode: string) => void;
  onSetLoadMode: (mode: string) => void;
  onPatchMuscuRow: (bi: number, patch: Partial<EditableBlock>) => void;
  onSetMuscuExercise: (bi: number, key: string) => void;
  onAddMuscuExercise: () => void;
  onRemoveMuscuExercise: (bi: number) => void;
  onPatchPpgGroup: (patch: Partial<EditableGroup>) => void;
  onPatchPpgStation: (bi: number, patch: Partial<EditableBlock>) => void;
  onAddPpgStation: () => void;
  onRemovePpgStation: (bi: number) => void;
  onApplyPreset: (key: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const [selectedPresetKey, setSelectedPresetKey] = useState('');
  const { spacing } = useTheme();
  const tid = `series-card-${index}`;
  const mode = series.kind === 'muscu' ? 'muscu' : 'ppg';
  const tileText = series.kind === 'ppg' ? `×${ppgRounds(series.group)}` : 'M';
  const summary = series.kind === 'muscu' ? muscuSummary(series) : ppgSummary(series.group);
  const loadMode = series.kind === 'muscu' ? muscuLoadMode(series) : 'percent_1rm';

  return (
    <SeriesCardFrame
      testID={tid}
      index={index}
      total={total}
      tileText={tileText}
      kicker={`Bloc ${index + 1}`}
      summary={summary}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onDelete={onDelete}
    >
      {/* Modèle */}
      <View>
        <FieldLabel>Modèle</FieldLabel>
        <PresetPicker
          testID={`${tid}-preset`}
          presets={STRENGTH_PRESETS}
          selectedKey={selectedPresetKey}
          onSelect={(key) => {
            setSelectedPresetKey(key);
            onApplyPreset(key);
          }}
        />
      </View>

      {/* Mode Muscu / PPG */}
      <View style={{ gap: spacing[2] }}>
        <FieldLabel>Mode</FieldLabel>
        <SegmentedControl
          testIDPrefix={`${tid}-mode`}
          options={MODES}
          selected={mode}
          onSelect={onSetMode}
        />
      </View>

      {series.kind === 'muscu' ? (
        <>
          {/* Table Muscu : Exercice | Séries | Reps | Charge | Tempo */}
          <EffortTable
            title="Exercices du bloc"
            onAddRow={onAddMuscuExercise}
            addRowTestID={`${tid}-add-exercise`}
            columns={[
              { label: 'Exercice', flex: 2 },
              { label: 'Séries' },
              { label: 'Reps' },
              { label: 'Charge' },
              { label: 'Tempo' },
            ]}
          >
            {series.blocks.map((block, bi) => (
              <MuscuRow
                key={block.key}
                block={block}
                index={bi}
                loadMode={loadMode}
                canDelete={series.blocks.length > 1}
                onPatch={(patch) => onPatchMuscuRow(bi, patch)}
                onSetExercise={(key) => onSetMuscuExercise(bi, key)}
                onDelete={() => onRemoveMuscuExercise(bi)}
                testIDPrefix={`${tid}-ex-${bi}`}
              />
            ))}
          </EffortTable>

          {/* Charge exprimée en */}
          <View style={{ gap: spacing[2] }}>
            <FieldLabel>Charge exprimée en</FieldLabel>
            <SegmentedControl
              testIDPrefix={`${tid}-loadmode`}
              options={LOAD_MODES}
              selected={loadMode}
              onSelect={onSetLoadMode}
            />
            <InfoNote>
              {loadMode === 'percent_1rm'
                ? 'Charge en % du 1RM de chaque athlète (référence générique affichée ≈ kg).'
                : loadMode === 'kg'
                  ? 'Charge absolue en kg, commune à tous les athlètes.'
                  : loadMode === 'bodyweight'
                    ? 'Travail au poids de corps, sans charge additionnelle.'
                    : 'Intensité perçue (RPE 1–10), indépendante d’un référentiel de charge.'}
            </InfoNote>
          </View>
        </>
      ) : (
        <>
          {/* Tours + récup entre tours */}
          <View
            style={{
              flexDirection: 'row',
              gap: spacing[3],
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <View>
              <FieldLabel>Tours</FieldLabel>
              <Stepper
                testID={`${tid}-rounds`}
                value={ppgRounds(series.group)}
                min={1}
                max={20}
                onValueChange={(v) => onPatchPpgGroup({ rounds: String(v) })}
                accessibilityLabel="Nombre de tours"
              />
            </View>
            <View>
              <FieldLabel>Récup. entre tours</FieldLabel>
              <InlineNumberInput
                testID={`${tid}-restR`}
                value={
                  Number(series.group.restBetweenRoundsSeconds) > 0
                    ? series.group.restBetweenRoundsSeconds
                    : ''
                }
                onChangeText={(t) => {
                  const v = parseInt(t, 10);
                  onPatchPpgGroup({ restBetweenRoundsSeconds: String(isNaN(v) ? 0 : v) });
                }}
                placeholder="0"
                unit="s"
              />
            </View>
          </View>

          {/* Table PPG : Station | Travail | Récup */}
          <EffortTable
            title="Stations du circuit"
            onAddRow={onAddPpgStation}
            addRowTestID={`${tid}-add-station`}
            columns={[{ label: 'Station', flex: 2 }, { label: 'Travail' }, { label: 'Récup' }]}
          >
            {series.group.items.map((block, bi) => (
              <PpgRow
                key={block.key}
                block={block}
                index={bi}
                canDelete={series.group.items.length > 1}
                onPatch={(patch) => onPatchPpgStation(bi, patch)}
                onDelete={() => onRemovePpgStation(bi)}
                testIDPrefix={`${tid}-station-${bi}`}
              />
            ))}
          </EffortTable>
          <InfoNote>
            {PRESET_TIPS[selectedPresetKey] ??
              'Circuit : le travail s’exprime en secondes ou en répétitions par station.'}
          </InfoNote>
        </>
      )}

      {series.kind === 'muscu' && selectedPresetKey && PRESET_TIPS[selectedPresetKey] ? (
        <InfoNote>{PRESET_TIPS[selectedPresetKey]}</InfoNote>
      ) : null}
    </SeriesCardFrame>
  );
}

// ---------- Rangée Muscu --------------------------------------------------------------------

function MuscuRow({
  block,
  index,
  loadMode,
  canDelete,
  onPatch,
  onSetExercise,
  onDelete,
  testIDPrefix,
}: {
  block: EditableBlock;
  index: number;
  loadMode: string;
  canDelete: boolean;
  onPatch: (patch: Partial<EditableBlock>) => void;
  onSetExercise: (key: string) => void;
  onDelete: () => void;
  testIDPrefix: string;
}) {
  const { spacing } = useTheme();
  const exerciseKey = block.params.exerciseKey ?? '';
  const custom = isCustomExercise(block);
  const targetKg =
    loadMode === 'percent_1rm'
      ? targetLoadFromOneRm(exerciseKey, Number(block.loadValue) || 0)
      : undefined;

  return (
    <View style={{ gap: spacing[1] }}>
      <EffortRowFrame
        testID={testIDPrefix}
        index={index}
        canDelete={canDelete}
        onDelete={onDelete}
        deleteLabel="Supprimer cet exercice"
      >
        <View style={{ flex: 2, gap: spacing[1] }}>
          <ExercisePicker
            testID={`${testIDPrefix}-exercise`}
            selectedKey={custom ? CUSTOM_EXERCISE_KEY : exerciseKey}
            onSelect={onSetExercise}
          />
          {custom ? (
            <NameInput
              testID={`${testIDPrefix}-custom-name`}
              value={block.name}
              onChangeText={(t) => onPatch({ name: t })}
              placeholder="Nom de l’exercice"
            />
          ) : null}
        </View>
        <CellInput
          testID={`${testIDPrefix}-sets`}
          value={block.sets}
          onChangeText={(t) => onPatch({ sets: t })}
        />
        <CellInput
          testID={`${testIDPrefix}-reps`}
          value={block.reps}
          onChangeText={(t) => onPatch({ reps: t })}
        />
        {loadMode === 'bodyweight' ? (
          <CellInput testID={`${testIDPrefix}-load`} value="" onChangeText={() => {}} unit="PdC" />
        ) : loadMode === 'rpe' ? (
          <CellInput
            testID={`${testIDPrefix}-load`}
            value={block.params.rpe ?? ''}
            onChangeText={(t) => onPatch({ params: { ...block.params, rpe: t } })}
            unit="RPE"
          />
        ) : (
          <CellInput
            testID={`${testIDPrefix}-load`}
            value={block.loadValue}
            onChangeText={(t) => onPatch({ loadValue: t })}
            unit={loadMode === 'kg' ? 'kg' : '%'}
          />
        )}
        <CellInput
          testID={`${testIDPrefix}-tempo`}
          value={block.params.tempo ?? ''}
          onChangeText={(t) => onPatch({ params: { ...block.params, tempo: t } })}
          decimal
        />
      </EffortRowFrame>
      {targetKg != null ? (
        <InfoNote>{`≈ ${targetKg} kg sur la référence du module`}</InfoNote>
      ) : null}
    </View>
  );
}

// ---------- Rangée PPG ----------------------------------------------------------------------

function PpgRow({
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
  onPatch: (patch: Partial<EditableBlock>) => void;
  onDelete: () => void;
  testIDPrefix: string;
}) {
  // Travail en durée (s) par défaut ; si la station porte des reps, on édite les reps.
  const usesReps = block.durationSeconds === '' && block.reps !== '';
  return (
    <EffortRowFrame
      testID={testIDPrefix}
      index={index}
      canDelete={canDelete}
      onDelete={onDelete}
      deleteLabel="Supprimer cette station"
    >
      <View style={{ flex: 2 }}>
        <NameInput
          testID={`${testIDPrefix}-name`}
          value={block.name}
          onChangeText={(t) => onPatch({ name: t })}
        />
      </View>
      {usesReps ? (
        <CellInput
          testID={`${testIDPrefix}-work`}
          value={block.reps}
          onChangeText={(t) => onPatch({ reps: t })}
          unit="rep"
        />
      ) : (
        <CellInput
          testID={`${testIDPrefix}-work`}
          value={block.durationSeconds}
          onChangeText={(t) => onPatch({ durationSeconds: t })}
          unit="s"
        />
      )}
      <CellInput
        testID={`${testIDPrefix}-rec`}
        value={block.restSeconds}
        onChangeText={(t) => onPatch({ restSeconds: t })}
        unit="s"
      />
    </EffortRowFrame>
  );
}

// ---------- Sélecteurs / champs texte -------------------------------------------------------

/** Sélecteur d'exercice Muscu (libellés `EXERCISE_LABELS`), s'appuie sur `PresetPicker`. */
function ExercisePicker({
  selectedKey,
  onSelect,
  testID,
}: {
  selectedKey: string;
  onSelect: (key: string) => void;
  testID: string;
}) {
  return (
    <PresetPicker
      testID={testID}
      presets={EXERCISE_OPTIONS.map((o) => ({ key: o.value, label: o.label }))}
      selectedKey={selectedKey}
      onSelect={onSelect}
    />
  );
}

/** Champ texte court (nom de station). */
function NameInput({
  value,
  onChangeText,
  testID,
  placeholder = 'Nom de la station',
}: {
  value: string;
  onChangeText: (t: string) => void;
  testID: string;
  placeholder?: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View
      style={{
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing[2],
        height: 38,
        justifyContent: 'center',
      }}
    >
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
        }}
      />
    </View>
  );
}
