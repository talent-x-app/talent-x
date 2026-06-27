import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@talent-x/design-tokens';
import { BlockType } from '@talent-x/api-client';
import {
  isEditableGroup,
  makeCooldownBlock,
  makeWarmupBlock,
  nodesToItems,
  type EditableBlock,
  type EditableNode,
} from './session-builder-ui';
import {
  CanvasKpiHeader,
  SmallIconBtn,
  WarmupCooldownBar,
  splitEffortNodes,
} from './effort-card-shared';
import { segmentSession, type Segment } from './discipline-inference';
import { DISCIPLINE_CANVAS } from './discipline-canvas';
import { GenericEffortCanvas, defaultGenericSeries } from './generic-effort-card';
import { DISCIPLINES, disciplineConfig, type DisciplineKey } from './discipline-assistants';
import { assistantSeed } from './assistant-presets';
import { sessionPhrase } from '../sessions/session-summary';

/**
 * Canvas **composite** de la séance « Personnalisé » (ADR-42). Chrome de séance (en-tête résumé +
 * barres échauffement/retour au calme + sélecteur « + bloc »), puis la liste des **séries** est
 * découpée en **segments par discipline inférée** (`segmentSession`) et chaque segment est rendu
 * par la carte de sa discipline en **mode encart** (`embedded`), ou par l'éditeur générique pour
 * un segment « Personnalisé ». Zéro nouveau modèle de données : la segmentation est dérivée et la
 * séance reste une `EditableNode[]` round-trippable via `nodesToItems`.
 */
export function CompositeCanvas({
  nodes,
  onChange,
}: {
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
}) {
  const { spacing } = useTheme();

  const { warmup, cooldown, series, hasWarmup, hasCooldown } = splitSeries(nodes);
  const segments = segmentSession(series);

  /**
   * Reconstruit la liste complète et notifie le parent. L'échauffement / retour au calme ne sont
   * **réinsérés que s'ils existent déjà** (ou viennent d'être édités, cf. `commitWith`) : une
   * séance custom non encadrée reste byte-identique (round-trip C-05), tout en exposant les barres
   * de chrome au niveau séance (ADR-42 §1).
   */
  function commit(newSeries: EditableNode[]) {
    commitWith(newSeries, hasWarmup ? warmup : null, hasCooldown ? cooldown : null);
  }

  function commitWith(newSeries: EditableNode[], w: EditableBlock | null, c: EditableBlock | null) {
    onChange([...(w ? [w] : []), ...newSeries, ...(c ? [c] : [])]);
  }

  /** Remplace la tranche `[start, end)` du segment `segIndex` par `newSegNodes`. */
  function spliceSegment(segIndex: number, newSegNodes: EditableNode[]) {
    const seg = segments[segIndex];
    if (!seg) return;
    const next = [...series.slice(0, seg.start), ...newSegNodes, ...series.slice(seg.end)];
    commit(next);
  }

  /** Déplace la tranche d'un segment au-dessus/en-dessous du segment voisin. */
  function moveSegment(segIndex: number, delta: -1 | 1) {
    const a = segments[segIndex];
    const b = segments[segIndex + delta];
    if (!a || !b) return;
    const [first, second] = delta === 1 ? [a, b] : [b, a];
    const before = series.slice(0, first.start);
    const after = series.slice(second.end);
    const next = [...before, ...second.nodes, ...first.nodes, ...after];
    commit(next);
  }

  /** Retire la tranche d'un segment. */
  function deleteSegment(segIndex: number) {
    const seg = segments[segIndex];
    if (!seg) return;
    commit([...series.slice(0, seg.start), ...series.slice(seg.end)]);
  }

  /** Ajoute un bloc en fin de canvas : seed d'une discipline (warmup/cooldown retirés) ou libre. */
  function addBloc(choice: DisciplineKey | 'custom') {
    if (choice === 'custom') {
      commit([...series, defaultGenericSeries()]);
      return;
    }
    const seed = assistantSeed(choice).filter(
      (n) => isEditableGroup(n) || (n.type !== BlockType.warmup && n.type !== BlockType.cooldown),
    );
    commit([...series, ...seed]);
  }

  const blocCount = segments.length;
  const phrase = sessionPhrase(nodesToItems(series));

  return (
    <View style={{ gap: spacing[3] }}>
      <CanvasKpiHeader
        testID="composite-canvas-summary"
        title={`Séance personnalisée · ${blocCount} bloc${blocCount > 1 ? 's' : ''}`}
        subtitle={phrase || 'Composez votre séance bloc par bloc'}
      />

      <WarmupCooldownBar
        testID="warmup-bar"
        icon="activity"
        title={warmup.name}
        subtitle={warmup.notes}
        placeholder="Appuyer pour ajouter"
        onEditNotes={(notes) =>
          commitWith(series, { ...warmup, notes }, hasCooldown ? cooldown : null)
        }
        onEditTitle={(name) =>
          commitWith(series, { ...warmup, name }, hasCooldown ? cooldown : null)
        }
        onRemove={
          hasWarmup ? () => commitWith(series, null, hasCooldown ? cooldown : null) : undefined
        }
      />

      <AddBlocPicker onAdd={addBloc} />

      {segments.map((seg, segIndex) => (
        <BlocFrame
          key={`${seg.kind}-${seg.start}`}
          segment={seg}
          index={segIndex}
          total={segments.length}
          onMoveUp={() => moveSegment(segIndex, -1)}
          onMoveDown={() => moveSegment(segIndex, 1)}
          onDelete={() => deleteSegment(segIndex)}
        >
          {seg.kind === 'discipline' ? (
            DISCIPLINE_CANVAS[seg.discipline]({
              nodes: seg.nodes,
              setNodes: (newSeg) => spliceSegment(segIndex, newSeg),
              embedded: true,
            })
          ) : (
            <GenericEffortCanvas
              nodes={seg.nodes}
              onChange={(newSeg) => spliceSegment(segIndex, newSeg)}
              embedded
            />
          )}
        </BlocFrame>
      ))}

      <WarmupCooldownBar
        testID="cooldown-bar"
        icon="wind"
        title={cooldown.name}
        subtitle={cooldown.notes}
        placeholder="Appuyer pour ajouter"
        onEditNotes={(notes) =>
          commitWith(series, hasWarmup ? warmup : null, { ...cooldown, notes })
        }
        onEditTitle={(name) => commitWith(series, hasWarmup ? warmup : null, { ...cooldown, name })}
        onRemove={
          hasCooldown ? () => commitWith(series, hasWarmup ? warmup : null, null) : undefined
        }
      />
    </View>
  );
}

/**
 * Défauts **vides** (titre seul, sans notes) pour le composite : tant qu'aucun échauffement /
 * retour au calme n'est réellement ajouté, la barre ne doit afficher AUCUN contenu fantôme — sinon
 * le coach croit qu'un échauffement est inclus alors qu'il n'est pas persisté (TLX-169). Le
 * contenu par défaut « Footing 12′… » reste réservé aux assistants standalone (ADR-39).
 */
const makeEmptyWarmup = (): EditableBlock => ({ ...makeWarmupBlock(), notes: '' });
const makeEmptyCooldown = (): EditableBlock => ({ ...makeCooldownBlock(), notes: '' });

/** Sépare warmup / cooldown / séries (un seul warmup/cooldown au niveau séance). */
function splitSeries(nodes: EditableNode[]): {
  warmup: EditableBlock;
  cooldown: EditableBlock;
  series: EditableNode[];
  hasWarmup: boolean;
  hasCooldown: boolean;
} {
  const { warmup, cooldown } = splitEffortNodes(
    nodes,
    BlockType.warmup,
    BlockType.cooldown,
    makeEmptyWarmup,
    makeEmptyCooldown,
  );
  const hasWarmup = nodes.some((n) => !isEditableGroup(n) && n.type === BlockType.warmup);
  const hasCooldown = nodes.some((n) => !isEditableGroup(n) && n.type === BlockType.cooldown);
  const series = nodes.filter(
    (n) => isEditableGroup(n) || (n.type !== BlockType.warmup && n.type !== BlockType.cooldown),
  );
  return { warmup, cooldown, series, hasWarmup, hasCooldown };
}

/** Titre d'un segment : libellé de la discipline, ou « Libre » pour un segment générique. */
function segmentTitle(segment: Segment): string {
  if (segment.kind === 'discipline') {
    return disciplineConfig(segment.discipline)?.label ?? segment.discipline;
  }
  return 'Libre';
}

/** Cadre d'un bloc : en-tête (titre + ▲▼🗑) puis le corps (carte dédiée ou éditeur générique). */
function BlocFrame({
  segment,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onDelete,
  children,
}: {
  segment: Segment;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const tid = `composite-bloc-${index}`;
  return (
    <View
      testID={tid}
      style={{
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        padding: spacing[3],
        gap: spacing[3],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.semibold,
            fontSize: typography.bodySm.fontSize,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          {`Bloc ${index + 1} · ${segmentTitle(segment)}`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          <SmallIconBtn
            testID={`${tid}-up`}
            icon="arrow-up"
            label="Monter le bloc"
            disabled={index === 0}
            onPress={onMoveUp}
          />
          <SmallIconBtn
            testID={`${tid}-down`}
            icon="arrow-down"
            label="Descendre le bloc"
            disabled={index === total - 1}
            onPress={onMoveDown}
          />
          <SmallIconBtn
            testID={`${tid}-delete`}
            icon="trash-2"
            label="Supprimer le bloc"
            tone="danger"
            onPress={onDelete}
          />
        </View>
      </View>
      {children}
    </View>
  );
}

/**
 * Sélecteur « + bloc » : un CTA explicite (« Ajouter un bloc »), placé juste après l'échauffement
 * (au-dessus des segments) plutôt qu'en bas de l'écran — c'est l'action principale du composite.
 * Pressé, il déplie une grille de puces icône + libellé (6 disciplines + « Personnalisé »), plus
 * lisible qu'un menu déroulant « Choisir un modèle… ».
 */
function AddBlocPicker({ onAdd }: { onAdd: (choice: DisciplineKey | 'custom') => void }) {
  const [open, setOpen] = useState(false);
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const options: {
    key: DisciplineKey | 'custom';
    label: string;
    icon: keyof typeof Feather.glyphMap;
  }[] = [
    ...DISCIPLINES.map((d) => ({ key: d.key, label: d.label, icon: d.icon })),
    { key: 'custom', label: 'Libre', icon: 'edit-3' },
  ];

  if (!open) {
    return (
      <Pressable
        testID="composite-add-bloc"
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Ajouter un bloc"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing[2],
          height: 48,
          borderRadius: radius.md,
          borderWidth: borderWidth.hairline,
          borderStyle: 'dashed',
          borderColor: colors.accent,
          backgroundColor: pressed ? colors.accentSubtle : 'transparent',
        })}
      >
        <Feather name="plus-circle" size={18} color={colors.accentText} />
        <Text
          style={{
            color: colors.accentText,
            fontFamily: typography.fontFamily.semibold,
            fontSize: typography.body.fontSize,
          }}
        >
          Ajouter un bloc
        </Text>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surface,
        padding: spacing[3],
        gap: spacing[3],
      }}
    >
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Quelle discipline pour ce bloc ?
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {options.map((opt) => (
          <Pressable
            key={opt.key}
            testID={`composite-add-bloc-${opt.key}`}
            onPress={() => {
              onAdd(opt.key);
              setOpen(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={opt.label}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[1],
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[3],
              borderRadius: radius.pill,
              borderWidth: borderWidth.hairline,
              borderColor: colors.borderStrong,
              backgroundColor: pressed ? colors.accentSubtle : colors.surfaceSunken,
            })}
          >
            <Feather name={opt.icon} size={14} color={colors.textSecondary} />
            <Text
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        testID="composite-add-bloc-cancel"
        onPress={() => setOpen(false)}
        accessibilityRole="button"
        accessibilityLabel="Annuler"
        style={{ alignSelf: 'flex-start' }}
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
