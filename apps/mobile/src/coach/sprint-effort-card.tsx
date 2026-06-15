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
import { formatDistanceVolume, sessionKpis, sessionPhrase } from '../sessions/session-summary';

/**
 * Carte d'effort de sprint (ADR-39, TLX-165) — éditeur **fidèle à la maquette** de l'assistant
 * Sprint, en remplacement du rendu générique de blocs. Chaque carte édite un **effort** = un
 * bloc `sprint` au sein d'une **série** (`groupType: "series"`, ADR-27). Elle lit/écrit les
 * **mêmes `params`/`EditableNode`** que le constructeur générique → la séance reste éditable en
 * C-05 sans perte (invariant ADR-38). `% VMA` n'est volontairement pas rendu ici (doublon avec
 * le référentiel d'intensité, cf. ADR-39).
 */

/** Valeurs du contrat (cf. BLOCK_TYPE_SPECS / ADR-38). Libellés FR. */
const DISTANCES_M = [20, 30, 40, 60, 80, 100, 150];
const START_TYPES = [
  { value: 'standing', label: 'Debout' },
  { value: 'three_point', label: '3 appuis' },
  { value: 'blocks', label: 'Blocks' },
  { value: 'flying', label: 'Lancé' },
];
const INTENSITY_MODES = [
  { value: 'percent_record', label: '% du record' },
  { value: 'target_time', label: 'Temps cible' },
  { value: 'speed', label: 'Vitesse' },
];
const RECOVERY_TYPES = [
  { value: 'passive', label: 'Passive' },
  { value: 'active', label: 'Active' },
];
const RECOV_R_SECONDS = [120, 180, 240, 360]; // r — entre reps
const RECOV_BIGR_SECONDS = [360, 480, 600, 720]; // R — entre séries

/** Une entrée éditable = un bloc `sprint` repéré par (index de groupe, index de membre). */
interface EffortEntry {
  gi: number;
  bi: number;
  group: EditableGroup;
  block: EditableBlock;
}

/** Extrait les efforts sprint (membres de séries) du canvas — l'ordre du canvas est préservé. */
function sprintEntries(nodes: EditableNode[]): EffortEntry[] {
  const entries: EffortEntry[] = [];
  nodes.forEach((node, gi) => {
    if (!isEditableGroup(node)) return;
    node.items.forEach((block, bi) => {
      if (block.type === BlockType.sprint) entries.push({ gi, bi, group: node, block });
    });
  });
  return entries;
}

/** Minutes « 4′ » (multiple de 60) ou « 90 s » sinon — pour les chips de récup. */
function recovLabel(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60}′` : `${seconds} s`;
}

/** Effort sprint par défaut (nouvel ajout) : 60 m, blocks, 95 % record, r 4′. */
function makeSprintEffort(): EditableBlock {
  return makeBlock({
    type: BlockType.sprint,
    name: '60 m',
    params: {
      reps: '1',
      distanceMeters: '60',
      recoverySeconds: '240',
      recoveryType: 'passive',
      startType: 'blocks',
      intensityMode: 'percent_record',
      intensityValue: '95',
    },
  });
}

export function SprintEffortCanvas({
  nodes,
  onChange,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const entries = sprintEntries(nodes);

  // Résumé live + volume (réutilise les dérivations TLX-160) sur l'ensemble du canvas.
  const items = nodesToItems(nodes);
  const phrase = sessionPhrase(items);
  const volume = formatDistanceVolume(sessionKpis(items).distanceMeters);

  /**
   * Patche les `params` d'un bloc repéré par (gi, bi) en **un seul** `onChange` (éviter deux
   * mises à jour successives dérivées du même `nodes` figé — la seconde écraserait la première).
   * Quand `distanceMeters` change, le **nom du bloc** suit (« 60 m ») dans la même passe.
   */
  function patchBlockParams(gi: number, bi: number, patch: Record<string, string>) {
    onChange(
      nodes.map((node, i) => {
        if (i !== gi || !isEditableGroup(node)) return node;
        return {
          ...node,
          items: node.items.map((b, j) => {
            if (j !== bi) return b;
            const params = { ...b.params, ...patch };
            const name = patch.distanceMeters != null ? `${patch.distanceMeters} m` : b.name;
            return { ...b, name, params };
          }),
        };
      }),
    );
  }

  /** Patche le groupe (séries = `rounds`, R = `restBetweenRoundsSeconds`). */
  function patchGroup(gi: number, patch: Partial<EditableGroup>) {
    onChange(nodes.map((node, i) => (i === gi ? { ...node, ...patch } : node)));
  }

  function addEffort() {
    onChange([
      ...nodes,
      makeSeriesGroup({ name: 'Série de sprint', rounds: '2', items: [makeSprintEffort()] }),
    ]);
  }

  function removeEffort(gi: number, bi: number) {
    const next: EditableNode[] = [];
    nodes.forEach((node, i) => {
      if (i !== gi || !isEditableGroup(node)) {
        next.push(node);
        return;
      }
      const remaining = node.items.filter((_, j) => j !== bi);
      if (remaining.length > 0) next.push({ ...node, items: remaining });
      // groupe vidé → retiré (jamais de série sans effort).
    });
    onChange(next);
  }

  return (
    <View testID="sprint-effort-canvas" style={{ gap: spacing[3] }}>
      {/* En-tête : résumé live + badge de volume (TLX-160). */}
      <View
        testID="sprint-canvas-summary"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: spacing[2],
        }}
      >
        <Text
          style={{
            flex: 1,
            minWidth: 160,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.semibold,
            fontSize: typography.body.fontSize,
          }}
        >
          {phrase !== '' ? phrase : 'Effort de sprint'}
        </Text>
        {volume != null && (
          <View
            style={{
              paddingHorizontal: spacing[3],
              height: 26,
              justifyContent: 'center',
              borderRadius: 999,
              backgroundColor: colors.successBg,
            }}
          >
            <Text
              style={{
                color: colors.success,
                fontFamily: typography.fontFamily.semibold,
                fontSize: typography.caption.fontSize,
              }}
            >
              Volume {volume}
            </Text>
          </View>
        )}
      </View>

      {entries.map((entry) => (
        <SprintEffortCard
          key={entry.block.key}
          entry={entry}
          total={entries.length}
          onParam={(patch) => patchBlockParams(entry.gi, entry.bi, patch)}
          onGroup={(patch) => patchGroup(entry.gi, patch)}
          onRemove={() => removeEffort(entry.gi, entry.bi)}
        />
      ))}

      <Button
        testID="sprint-add-effort"
        variant="secondary"
        leftIcon={<Feather name="plus" size={18} color={colors.textPrimary} />}
        onPress={addEffort}
      >
        Ajouter un effort
      </Button>
    </View>
  );
}

/** Une carte = un effort sprint (un bloc dans une série). */
function SprintEffortCard({
  entry,
  total,
  onParam,
  onGroup,
  onRemove,
}: {
  entry: EffortEntry;
  total: number;
  onParam: (patch: Record<string, string>) => void;
  onGroup: (patch: Partial<EditableGroup>) => void;
  onRemove: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const { gi, bi, group, block } = entry;
  const prefix = `effort-${gi}-${bi}`;
  const p = block.params;

  const distance = Number(p.distanceMeters ?? '') || 0;
  const reps = Number(p.reps ?? '1') || 1;
  const rounds = Number(group.rounds ?? '1') || 1;
  const startType = p.startType ?? 'blocks';
  const flyingZone = p.flyingZone === 'true';
  const intensityMode = p.intensityMode ?? 'percent_record';
  const intensityValue = Number(p.intensityValue ?? '') || 0;
  const recovR = Number(p.recoverySeconds ?? '') || 0;
  const recoveryType = p.recoveryType ?? 'passive';
  const recovBigR = Number(group.restBetweenRoundsSeconds ?? '') || 0;

  /** La distance pilote `distanceMeters` (et le nom du bloc, géré dans `patchBlockParams`). */
  const setDistance = (m: number) => onParam({ distanceMeters: String(m) });

  return (
    <Card testID={prefix}>
      <View style={{ gap: spacing[4] }}>
        {/* En-tête : kicker + bouton supprimer (si plusieurs efforts). */}
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.semibold,
              fontSize: typography.caption.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
            }}
          >
            Effort de sprint
          </Text>
          {total > 1 && (
            <Pressable
              testID={`${prefix}-remove`}
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel="Supprimer cet effort"
              hitSlop={8}
            >
              <Feather name="trash-2" size={18} color={colors.danger} />
            </Pressable>
          )}
        </View>

        {/* Distance */}
        <Field label="Distance">
          <ChipRow
            options={DISTANCES_M.map((m) => ({ value: String(m), label: `${m} m` }))}
            selected={String(distance)}
            onSelect={(v) => setDistance(Number(v))}
            testIDPrefix={`${prefix}-dist`}
          />
        </Field>

        {/* Répétitions / Séries */}
        <View style={{ flexDirection: 'row', gap: spacing[5] }}>
          <Field label="Répétitions">
            <Stepper
              testID={`${prefix}-reps`}
              value={reps}
              min={1}
              max={20}
              onValueChange={(v) => onParam({ reps: String(v) })}
              accessibilityLabel="Répétitions"
            />
          </Field>
          <Field label="Séries">
            <Stepper
              testID={`${prefix}-series`}
              value={rounds}
              min={1}
              max={20}
              onValueChange={(v) => onGroup({ rounds: String(v) })}
              accessibilityLabel="Séries"
            />
          </Field>
        </View>

        {/* Départ + zone lancée */}
        <Field label="Départ">
          <ChipRow
            options={START_TYPES}
            selected={startType}
            onSelect={(v) => onParam({ startType: v })}
            testIDPrefix={`${prefix}-start`}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[2],
              marginTop: spacing[2],
            }}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Zone lancée
            </Text>
            <Chip
              testID={`${prefix}-flying-yes`}
              selected={flyingZone}
              onPress={() => onParam({ flyingZone: 'true' })}
            >
              Oui
            </Chip>
            <Chip
              testID={`${prefix}-flying-no`}
              selected={!flyingZone}
              onPress={() => onParam({ flyingZone: 'false' })}
            >
              Non
            </Chip>
          </View>
        </Field>

        {/* Intensité : référentiel + valeur */}
        <Field label="Intensité">
          <ChipRow
            options={INTENSITY_MODES}
            selected={intensityMode}
            onSelect={(v) => onParam({ intensityMode: v })}
            testIDPrefix={`${prefix}-imode`}
          />
          {intensityMode === 'percent_record' ? (
            <View style={{ marginTop: spacing[2] }}>
              <Stepper
                testID={`${prefix}-ivalue`}
                value={intensityValue || 95}
                min={50}
                max={110}
                step={5}
                format={(v) => `${v} %`}
                onValueChange={(v) => onParam({ intensityValue: String(v) })}
                accessibilityLabel="Valeur d’intensité"
              />
            </View>
          ) : (
            <NumberInput
              testID={`${prefix}-ivalue-input`}
              value={p.intensityValue ?? ''}
              onChangeText={(t) => onParam({ intensityValue: t })}
              placeholder={intensityMode === 'target_time' ? 'Ex. 7.37 (s)' : 'Ex. 9.5 (m/s)'}
            />
          )}
        </Field>

        {/* Récupération r (entre reps) + type */}
        <Field label="Récup. r — entre reps">
          <ChipRow
            options={RECOV_R_SECONDS.map((s) => ({ value: String(s), label: recovLabel(s) }))}
            selected={String(recovR)}
            onSelect={(v) => onParam({ recoverySeconds: v })}
            testIDPrefix={`${prefix}-recov`}
          />
          <View style={{ flexDirection: 'row', gap: spacing[2], marginTop: spacing[2] }}>
            {RECOVERY_TYPES.map((rt) => (
              <Chip
                key={rt.value}
                testID={`${prefix}-rtype-${rt.value}`}
                selected={recoveryType === rt.value}
                onPress={() => onParam({ recoveryType: rt.value })}
              >
                {rt.label}
              </Chip>
            ))}
          </View>
        </Field>

        {/* Récupération R (entre séries) */}
        <Field label="Récup. R — entre séries">
          <ChipRow
            options={RECOV_BIGR_SECONDS.map((s) => ({ value: String(s), label: recovLabel(s) }))}
            selected={String(recovBigR)}
            onSelect={(v) => onGroup({ restBetweenRoundsSeconds: v })}
            testIDPrefix={`${prefix}-bigR`}
          />
        </Field>

        {/* Astuce coach contextuelle. */}
        <View
          style={{
            flexDirection: 'row',
            gap: spacing[2],
            backgroundColor: colors.warningBg,
            borderRadius: 10,
            padding: spacing[3],
          }}
        >
          <Feather name="info" size={15} color={colors.warning} />
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Récupération quasi complète recommandée pour préserver la qualité de chaque sprint.
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** Libellé + contenu d'un champ de la carte. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

/** Rangée de chips à sélection unique (segmented). */
function ChipRow({
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
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
      {options.map((o) => (
        <Chip
          key={o.value}
          testID={`${testIDPrefix}-${o.value}`}
          selected={selected === o.value}
          onPress={() => onSelect(o.value)}
        >
          {o.label}
        </Chip>
      ))}
    </View>
  );
}

/** Petit champ numérique (modes d'intensité temps/vitesse — décimales autorisées). */
function NumberInput({
  value,
  onChangeText,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  testID?: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType="numeric"
      style={{
        marginTop: spacing[2],
        height: 44,
        paddingHorizontal: spacing[4],
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        color: colors.textPrimary,
        fontFamily: typography.fontFamily.regular,
        fontSize: typography.body.fontSize,
      }}
    />
  );
}
