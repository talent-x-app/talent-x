import { useState, type ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { Button, Card } from '../components/ui';
import {
  isEditableGroup,
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

// ---------- Helpers de manipulation des séries ----------------------------------------------

/** Sépare un canvas en échauffement / séries / retour au calme, avec valeurs par défaut. */
export function splitEffortNodes(
  nodes: EditableNode[],
  warmupType: BlockTypeLike,
  cooldownType: BlockTypeLike,
  makeWarmup: () => EditableBlock,
  makeCooldown: () => EditableBlock,
) {
  const warmup =
    (nodes.find((n) => !isEditableGroup(n) && (n as EditableBlock).type === warmupType) as
      | EditableBlock
      | undefined) ?? makeWarmup();
  const cooldown =
    (nodes.find((n) => !isEditableGroup(n) && (n as EditableBlock).type === cooldownType) as
      | EditableBlock
      | undefined) ?? makeCooldown();
  const series = nodes.filter((n) => isEditableGroup(n)) as EditableGroup[];
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
  header: ReactNode;
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
              color: colors.textMuted,
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
  children,
}: {
  title: string;
  onAddRow?: () => void;
  addRowTestID?: string;
  addRowLabel?: string;
  columns: EffortColumn[];
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

      <View style={{ flexDirection: 'row', gap: spacing[2], marginBottom: spacing[1] }}>
        <Text style={[colHeaderStyle, { width: 20, color: colors.textMuted }]}>#</Text>
        {columns.map((c, i) => (
          <Text
            key={i}
            style={[
              colHeaderStyle,
              c.width != null ? { width: c.width } : { flex: c.flex ?? 1 },
              { color: colors.textMuted },
            ]}
          >
            {c.label}
          </Text>
        ))}
        <View style={{ width: 24 }} />
      </View>

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
          color: colors.textMuted,
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

export function WarmupCooldownBar({
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
}: {
  presets: { key: string; label: string }[];
  selectedKey: string;
  onSelect: (key: string) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const selectedLabel = presets.find((p) => p.key === selectedKey)?.label;

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
          borderColor: selectedLabel ? colors.accent : colors.borderStrong,
          backgroundColor: colors.surfaceSunken,
          gap: spacing[2],
        }}
      >
        <Text
          style={{
            flex: 1,
            color: selectedLabel ? colors.accentText : colors.textMuted,
            fontFamily: selectedLabel
              ? typography.fontFamily.medium
              : typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
          numberOfLines={1}
        >
          {selectedLabel ?? 'Choisir un modèle…'}
        </Text>
        <Feather
          name="chevron-down"
          size={14}
          color={selectedLabel ? colors.accentText : colors.textMuted}
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
      {presets.map((p) => (
        <Pressable
          key={p.key}
          testID={testID ? `${testID}-${p.key}` : undefined}
          onPress={() => {
            onSelect(p.key);
            setOpen(false);
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
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (t: string) => void;
  unit?: string;
  decimal?: boolean;
  placeholder?: string;
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
        placeholder={placeholder}
        style={{
          flex: 1,
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
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.caption.fontSize,
            minWidth: unit.length > 2 ? 30 : 16,
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
