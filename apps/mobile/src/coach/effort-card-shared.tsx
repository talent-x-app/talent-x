import { useState, type ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { Button, Card } from '../components/ui';
import {
  isEditableGroup,
  makeSeriesGroup,
  sanitizeNumeric,
  type EditableBlock,
  type EditableGroup,
  type EditableNode,
} from './session-builder-ui';

/**
 * Primitives et ossature partagées des **canvas d'effort par discipline** (ADR-39, TLX-165→167).
 * Le canvas Sprint a défini le patron (Échauffement · cartes de série · Retour au calme · +
 * ajouter, 1 carte = 1 série) ; Haies / Endurance / Sauts / Lancers le réutilisent à l'identique
 * pour la structure, en n'apportant que leurs colonnes de tableau et leurs champs partagés.
 * Aucun changement de contrat : tout est sérialisé via `nodesToItems` comme le constructeur C-05.
 */

// ---------- Référence données partagée --------------------------------------------------------

/**
 * Type de récupération (`recoveryType`, ADR-39 §6) — clé additive de `params`, partagée par les
 * canvas qui l'exposent (Sprint : récup r ; Endurance : récup entre efforts). Le **défaut diffère
 * par discipline** et reste porté par chaque canvas : `passive` en sprint (maquette
 * `sprint-card.html`), `active` en endurance.
 */
export const RECOVERY_TYPES = [
  { value: 'active', label: 'Active' },
  { value: 'passive', label: 'Passive' },
];

// ---------- Helpers de manipulation des séries ----------------------------------------------

/** Sépare un canvas en échauffement / séries / retour au calme, avec valeurs par défaut. */
export function splitEffortNodes(
  nodes: EditableNode[],
  warmupType: BlockTypeLike,
  cooldownType: BlockTypeLike,
  makeWarmup: () => EditableBlock,
  makeCooldown: () => EditableBlock,
) {
  const warmupNode = nodes.find(
    (n) => !isEditableGroup(n) && (n as EditableBlock).type === warmupType,
  ) as EditableBlock | undefined;
  const cooldownNode = nodes.find(
    (n) => !isEditableGroup(n) && (n as EditableBlock).type === cooldownType,
  ) as EditableBlock | undefined;
  const warmup = warmupNode ?? makeWarmup();
  const cooldown = cooldownNode ?? makeCooldown();
  // Séries = tous les autres nœuds, dans l'ordre. Un bloc significatif top-level (ni
  // warmup/cooldown, ni groupe) est **enveloppé** dans une série mono-item au lieu d'être
  // jeté : sans quoi il disparaissait de la carte puis était perdu au prochain commit
  // (TLX-168 — perte de données à l'édition d'une séance dont la discipline est inférée d'un
  // bloc top-level). La clé dérive de celle du bloc → pas de remontage de carte à chaque rendu.
  const series: EditableGroup[] = [];
  for (const n of nodes) {
    if (n === warmupNode || n === cooldownNode) continue;
    if (isEditableGroup(n)) {
      series.push(n);
    } else if (n.type !== warmupType && n.type !== cooldownType) {
      series.push(makeSeriesGroup({ key: `wrap-${n.key}`, name: n.name || 'Série', items: [n] }));
    }
  }
  return { warmup, cooldown, series };
}

type BlockTypeLike = EditableBlock['type'];

// ---------- Ossature du canvas --------------------------------------------------------------

/**
 * Coquille structurelle d'un canvas d'effort : en-tête KPI, échauffement optionnel, cartes de
 * série (fournies en enfants), retour au calme optionnel, bouton « + ajouter une série ».
 */
export function EffortCanvasShell({
  testID,
  header,
  warmup,
  cooldown,
  onAddSeries,
  addSeriesLabel = 'Ajouter une série',
  addSeriesTestID,
  children,
}: {
  testID: string;
  /** En-tête KPI de la carte. Omis en mode encart (`embedded`) — le composite porte le chrome. */
  header?: ReactNode;
  warmup?: ReactNode;
  cooldown?: ReactNode;
  onAddSeries: () => void;
  addSeriesLabel?: string;
  addSeriesTestID?: string;
  children: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View testID={testID} style={{ gap: spacing[3] }}>
      {header}
      {warmup}
      {children}
      {cooldown}
      <Button
        testID={addSeriesTestID}
        variant="secondary"
        leftIcon={<Feather name="plus" size={18} color={colors.textPrimary} />}
        onPress={onAddSeries}
      >
        {addSeriesLabel}
      </Button>
    </View>
  );
}

/** En-tête KPI condensé du canvas (titre fort + ligne secondaire). */
export function CanvasKpiHeader({
  testID,
  title,
  subtitle,
}: {
  testID?: string;
  title: string;
  subtitle: string;
}) {
  const { colors, typography } = useTheme();
  return (
    <View testID={testID}>
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.body.fontSize,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {subtitle}
      </Text>
    </View>
  );
}

// ---------- Cadre de carte de série ---------------------------------------------------------

/**
 * Cadre commun d'une carte de série : tuile « ×N », kicker, résumé replié, contrôles d'ordre,
 * repli/dépliage. Le corps (modèle, tableau, champs partagés) est fourni en enfants et n'est
 * rendu que carte dépliée.
 */
export function SeriesCardFrame({
  testID,
  index,
  total,
  tileText,
  kicker,
  summary,
  onMoveUp,
  onMoveDown,
  onDelete,
  children,
}: {
  testID: string;
  index: number;
  total: number;
  tileText: string;
  kicker: string;
  summary: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { colors, typography, spacing, radius } = useTheme();

  return (
    <Card testID={testID}>
      <Pressable
        testID={`${testID}-toggle`}
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
            {tileText}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.caption.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            {kicker}
          </Text>
          <Text
            testID={`${testID}-summary`}
            numberOfLines={1}
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.caption.fontSize,
            }}
          >
            {summary}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          <SmallIconBtn
            testID={`${testID}-up`}
            icon="arrow-up"
            label="Monter la série"
            disabled={index === 0}
            onPress={onMoveUp}
          />
          <SmallIconBtn
            testID={`${testID}-down`}
            icon="arrow-down"
            label="Descendre la série"
            disabled={index === total - 1}
            onPress={onMoveDown}
          />
          {total > 1 && (
            <SmallIconBtn
              testID={`${testID}-del`}
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

      {!collapsed && <View style={{ gap: spacing[4], marginTop: spacing[4] }}>{children}</View>}
    </Card>
  );
}

// ---------- Tableau d'efforts ---------------------------------------------------------------

/** Définition d'une colonne du tableau d'efforts. */
export interface EffortColumn {
  label: string;
  /** Largeur fixe (px) ou drapeau flex (par défaut flex: 1). */
  width?: number;
  flex?: number;
}

/** En-tête du tableau d'efforts (titre de section + bouton « ajouter » + en-têtes de colonnes). */
export function EffortTable({
  title,
  onAddRow,
  addRowTestID,
  addRowLabel = 'ajouter',
  columns,
  hideColumnHeader = false,
  children,
}: {
  title: string;
  onAddRow?: () => void;
  addRowTestID?: string;
  addRowLabel?: string;
  columns: EffortColumn[];
  /** Masque la rangée d'en-têtes de colonnes (mise en page « carte » dont chaque ligne porte ses
   *  propres libellés — ex. les exercices Muscu sur mobile). */
  hideColumnHeader?: boolean;
  children: ReactNode;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing[2] }}>
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
          {title}
        </Text>
        {onAddRow && (
          <Pressable
            testID={addRowTestID}
            onPress={onAddRow}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
            accessibilityRole="button"
            accessibilityLabel={`${addRowLabel} ${title}`}
          >
            <Feather name="plus" size={14} color={colors.accentText} />
            <Text
              style={{
                color: colors.accentText,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {addRowLabel}
            </Text>
          </Pressable>
        )}
      </View>

      {!hideColumnHeader && (
        <View style={{ flexDirection: 'row', gap: spacing[2], marginBottom: spacing[1] }}>
          <Text style={[colHeaderStyle, { width: 20, color: colors.textSecondary }]}>#</Text>
          {columns.map((c, i) => (
            <Text
              key={i}
              style={[
                colHeaderStyle,
                // `minWidth: 0` pour suivre les cellules (qui se rétrécissent) et rester aligné en
                // largeur étroite (TLX-191).
                c.width != null ? { width: c.width } : { flex: c.flex ?? 1, minWidth: 0 },
                { color: colors.textSecondary },
              ]}
            >
              {c.label}
            </Text>
          ))}
          <View style={{ width: 24 }} />
        </View>
      )}

      {children}
    </View>
  );
}

/** Conteneur d'une rangée d'effort : numéro + cellules (enfants) + bouton suppression. */
export function EffortRowFrame({
  testID,
  index,
  canDelete,
  onDelete,
  deleteLabel = 'Supprimer cette ligne',
  children,
}: {
  testID: string;
  index: number;
  canDelete: boolean;
  onDelete: () => void;
  deleteLabel?: string;
  children: ReactNode;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        marginBottom: spacing[2],
      }}
    >
      <Text
        style={{
          width: 20,
          textAlign: 'center',
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.caption.fontSize,
        }}
      >
        {index + 1}
      </Text>
      {children}
      {canDelete ? (
        <Pressable
          testID={`${testID}-del`}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
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

// ---------- Barre Échauffement / Retour au calme --------------------------------------------

/**
 * Durée d'une borne : le document la porte en **secondes** (`durationSeconds` — c'est ce que lit
 * `plannedDurationMinutes`, TLX-113), le coach la pense en minutes. Le champ est donc à la
 * **minute**, comme « Durée (min) » du brief. Une valeur qui n'est pas un compte rond de minutes
 * (documents importés) s'affiche arrondie ; la valeur stockée, elle, n'est réécrite que si le
 * coach tape — l'affichage n'altère rien de lui-même.
 */
export function barDurationMinutes(durationSeconds: string): string {
  const seconds = Number(durationSeconds.trim());
  if (durationSeconds.trim() === '' || !Number.isFinite(seconds) || seconds <= 0) return '';
  return String(Math.round(seconds / 60));
}

/** Minutes saisies → secondes du modèle éditable ; chaîne vide = durée effacée. */
export function barDurationSeconds(minutes: string): string {
  const trimmed = minutes.trim();
  if (trimmed === '') return '';
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return '';
  return String(Math.round(n * 60));
}

export function WarmupCooldownBar({
  icon,
  title,
  subtitle,
  placeholder,
  durationSeconds,
  onEditNotes,
  onEditTitle,
  onEditDurationSeconds,
  onRemove,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  /** Invite affichée (repliée) quand `subtitle` est vide — ex. « Appuyer pour ajouter » (TLX-169). */
  placeholder?: string;
  /**
   * Durée de la phase, en secondes (forme du modèle éditable). TLX-259 : sans elle, la séance
   * ne pèse rien au monitoring de charge — l'échauffement annonçait « ~25 min » dans `notes`,
   * lisible par un humain et invisible pour le calcul.
   */
  durationSeconds?: string;
  onEditNotes: (notes: string) => void;
  /** Édition du titre (composite, TLX-172 #5). Absent → titre figé (cartes standalone). */
  onEditTitle?: (title: string) => void;
  /** Édition de la durée (TLX-259). Absent → aucun champ Durée. */
  onEditDurationSeconds?: (durationSeconds: string) => void;
  /** Suppression de la phase une fois ajoutée (composite, TLX-172 #5). */
  onRemove?: () => void;
  testID?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const minutes = barDurationMinutes(durationSeconds ?? '');
  // Ligne repliée : durée puis description. Vide tant que ni l'une ni l'autre n'est posée —
  // la barre ne doit afficher AUCUN contenu fantôme (TLX-169).
  const summary = [minutes ? `${minutes} min` : '', subtitle].filter((p) => p !== '').join(' · ');

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
          {!expanded &&
            (summary ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.caption.fontSize,
                }}
                numberOfLines={1}
              >
                {summary}
              </Text>
            ) : placeholder ? (
              <Text
                style={{
                  // Invite (placeholder) : décorative → textMuted (règle TLX-145/151).
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.caption.fontSize,
                  fontStyle: 'italic',
                }}
                numberOfLines={1}
              >
                {placeholder}
              </Text>
            ) : null)}
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-right'}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={{ paddingHorizontal: spacing[3], paddingBottom: spacing[3], gap: spacing[2] }}>
          {onEditTitle ? (
            <TextInput
              testID={testID ? `${testID}-title` : undefined}
              value={title}
              onChangeText={onEditTitle}
              placeholder="Titre de la phase…"
              placeholderTextColor={colors.textMuted}
              style={{
                height: 40,
                paddingHorizontal: spacing[3],
                borderRadius: radius.sm,
                borderWidth: borderWidth.hairline,
                borderColor: colors.borderStrong,
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            />
          ) : null}
          {onEditDurationSeconds ? (
            <TextInput
              testID={testID ? `${testID}-duration` : undefined}
              value={minutes}
              // Minutes entières : `blockToExercise` ne sérialise qu'un entier de secondes, et un
              // séparateur décimal saisi puis reformaté ferait sauter le curseur.
              onChangeText={(t) =>
                onEditDurationSeconds(barDurationSeconds(t.replace(/[^0-9]/g, '')))
              }
              keyboardType="numeric"
              placeholder="Durée en minutes…"
              placeholderTextColor={colors.textMuted}
              style={{
                height: 40,
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
          ) : null}
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
          {onRemove ? (
            <Pressable
              testID={testID ? `${testID}-remove` : undefined}
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel="Retirer cette phase"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[1],
                paddingVertical: 4,
              }}
            >
              <Feather name="trash-2" size={14} color={colors.danger} />
              <Text
                style={{
                  color: colors.danger,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Retirer
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ---------- Note informative ----------------------------------------------------------------

/** Encart informatif (fond chaud + icône info) — note de cible / référentiel d'intensité. */
export function InfoNote({ children }: { children: ReactNode }) {
  const { colors, typography, spacing } = useTheme();
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
        {children}
      </Text>
    </View>
  );
}

// ---------- Contrôle segmenté ---------------------------------------------------------------

export function SegmentedControl({
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
              // `minHeight` (et non hauteur fixe) + padding : un libellé long (« Allure spécifique »
              // sur 4 options) peut passer sur 2 lignes sans être tronqué ; toutes les cases
              // s'alignent à la plus haute (flex row).
              minHeight: 36,
              paddingVertical: 4,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: sel ? colors.accentSubtle : pressed ? colors.surface : 'transparent',
              borderLeftWidth: i > 0 ? borderWidth.hairline : 0,
              borderLeftColor: colors.borderStrong,
            })}
          >
            <Text
              numberOfLines={2}
              style={{
                textAlign: 'center',
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

// ---------- Bascule on/off ------------------------------------------------------------------

export function SwitchToggle({
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

// ---------- Sélecteur de preset -------------------------------------------------------------

/** Sélecteur de modèle en liste déroulante — affiche le nom du modèle sélectionné. */
export function PresetPicker({
  presets,
  selectedKey,
  onSelect,
  testID,
  subtle = false,
  placeholder = 'Choisir un modèle…',
}: {
  presets: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
  testID?: string;
  /** Style discret (bordure neutre, fond surface) — pour les sélecteurs secondaires (ex. exercice
   *  Muscu) qui ne doivent pas concurrencer visuellement le sélecteur de modèle principal. */
  subtle?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const selectedLabel = presets.find((p) => p.key === selectedKey)?.label;
  const accented = !subtle && selectedLabel != null;
  // Recherche au-delà de ~8 entrées (ex. catalogue d'exercices) ; inutile pour 5–7 modèles.
  const searchable = presets.length > 8;
  // Normalisation insensible casse + accents (« dev » doit matcher « Développé »).
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(query.trim());
  const filtered = searchable && q ? presets.filter((p) => norm(p.label).includes(q)) : presets;
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  if (!open) {
    return (
      <Pressable
        testID={testID}
        onPress={() => setOpen(true)}
        style={{
          height: subtle ? 38 : 42,
          paddingHorizontal: spacing[3],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: radius.sm,
          borderWidth: borderWidth.hairline,
          borderColor: accented ? colors.accent : colors.borderStrong,
          backgroundColor: subtle ? colors.surface : colors.surfaceSunken,
          gap: spacing[2],
        }}
      >
        <Text
          style={{
            flex: 1,
            color: accented
              ? colors.accentText
              : selectedLabel
                ? colors.textPrimary
                : colors.textMuted,
            fontFamily:
              selectedLabel && !subtle
                ? typography.fontFamily.medium
                : typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
          numberOfLines={1}
        >
          {selectedLabel ?? placeholder}
        </Text>
        <Feather
          name="chevron-down"
          size={14}
          color={accented ? colors.accentText : colors.textMuted}
        />
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
      {/* Recherche (listes longues) : filtrer au lieu de tout dérouler. */}
      {searchable ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[2],
            paddingHorizontal: spacing[3],
            height: 40,
            borderBottomWidth: borderWidth.hairline,
            borderBottomColor: colors.border,
          }}
        >
          <Feather name="search" size={14} color={colors.textMuted} />
          <TextInput
            testID={testID ? `${testID}-search` : undefined}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Rechercher…"
            placeholderTextColor={colors.textMuted}
            style={{
              flex: 1,
              padding: 0,
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          />
        </View>
      ) : null}
      {/* Liste scrollable à hauteur bornée (au lieu d'occuper tout l'écran). */}
      <ScrollView
        style={{ maxHeight: 240 }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {filtered.map((p) => (
          <Pressable
            key={p.key}
            testID={testID ? `${testID}-${p.key}` : undefined}
            onPress={() => {
              onSelect(p.key);
              close();
            }}
            style={({ pressed }) => ({
              paddingHorizontal: spacing[3],
              paddingVertical: spacing[2],
              backgroundColor:
                p.key === selectedKey
                  ? colors.accentSubtle
                  : pressed
                    ? colors.surfaceSunken
                    : 'transparent',
            })}
          >
            <Text
              style={{
                color: p.key === selectedKey ? colors.accentText : colors.textPrimary,
                fontFamily:
                  p.key === selectedKey
                    ? typography.fontFamily.semibold
                    : typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
        {filtered.length === 0 ? (
          <Text
            style={{
              paddingHorizontal: spacing[3],
              paddingVertical: spacing[3],
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Aucun résultat
          </Text>
        ) : null}
      </ScrollView>
      <Pressable
        onPress={close}
        style={{
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[2],
          borderTopWidth: borderWidth.hairline,
          borderTopColor: colors.border,
        }}
      >
        <Text
          style={{
            color: colors.textSecondary,
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

// ---------- Champs / cellules ---------------------------------------------------------------

/** Libellé de section. */
export function FieldLabel({ children }: { children: string }) {
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

export const colHeaderStyle = {
  fontSize: 10,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};

/** Cellule numérique d'un tableau d'efforts (avec unité courte à droite). */
export function CellInput({
  value,
  onChangeText,
  unit,
  decimal = false,
  text = false,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (t: string) => void;
  unit?: string;
  decimal?: boolean;
  /** Champ libre (ex. épreuve « 110mH », tempo « 31X1 ») — pas de filtrage numérique. */
  text?: boolean;
  placeholder?: string;
  testID?: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        // `minWidth: 0` indispensable : react-native-web donne aux items flex un `min-width: auto`
        // = largeur intrinsèque de l'`<input>` (~150px). Sans ça, `flex:1` ne peut PAS rétrécir les
        // cellules sous cette taille → en largeur étroite (mobile) les colonnes se chevauchent et
        // valeurs/unités débordent (TLX-191). À 0, les 3 colonnes se répartissent la largeur réelle.
        minWidth: 0,
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
        // Filtre la saisie pour les champs numériques (sur web, le clavier numérique n'empêche
        // pas de taper des lettres). `text` = champ libre, aucune restriction.
        onChangeText={text ? onChangeText : (t) => onChangeText(sanitizeNumeric(t, decimal))}
        keyboardType={text ? 'default' : decimal ? 'numeric' : 'number-pad'}
        // Champ aligné à droite : sans ça, react-native-web place le caret en position 0 (à
        // gauche, avant la valeur) au clic. On sélectionne le nombre au focus → réécriture directe.
        selectTextOnFocus={!text}
        placeholder={placeholder}
        style={{
          flex: 1,
          minWidth: 0, // laisse l'input rétrécir dans sa cellule (cf. minWidth:0 du conteneur)
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
          textAlign: 'right',
        }}
        placeholderTextColor={colors.textMuted}
      />
      {unit ? (
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.caption.fontSize,
            // Réserve d'unité **constante** : sinon des unités de largeurs min différentes
            // (« % » 16 vs « min » 30) décalent les colonnes d'une ligne à l'autre du tableau
            // (la dernière ligne « → R » n'ayant pas d'unité). Largeur fixe = colonnes alignées.
            minWidth: 26,
          }}
        >
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

/** Entrée numérique avec unité pour les champs hors tableau (récup R, etc.). */
export function InlineNumberInput({
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
        // Filtre la saisie numérique (web : le clavier numérique n'empêche pas les lettres).
        // Décimal autorisé (ex. récup R en minutes « 1.5 »).
        onChangeText={(t) => onChangeText(sanitizeNumeric(t, true))}
        keyboardType="numeric"
        // Sélectionne la valeur au focus (champ aligné à droite → évite le caret à gauche).
        selectTextOnFocus
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
          color: colors.textSecondary,
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
export function SmallIconBtn({
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

// ---------- Utilitaires de format -----------------------------------------------------------

/** Minutes lisibles : « 5′ » entier, « 1,5′ » sinon. */
export function formatMinutes(seconds: number): string {
  const m = seconds / 60;
  return Number.isInteger(m) ? `${m}′` : `${m.toFixed(1).replace('.', ',')}′`;
}
