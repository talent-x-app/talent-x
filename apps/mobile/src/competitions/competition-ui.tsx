import { CompetitionEntryStatus, CompetitionStatus, type Competition } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/ui';

/**
 * Briques d'UI partagées des compétitions (TLX-101, ADR-24) : badge de statut, ligne de
 * liste, formatage de période. Réutilisées par les écrans coach (liste/édition/engagement)
 * et athlète (liste/détail). Tous les visuels dérivent des tokens du design system.
 */

/** Libellé + tonalité (token) par statut de compétition. Aligné sur `COMPETITION_STATUS_META`. */
export const COMPETITION_STATUS_UI: Record<
  CompetitionStatus,
  { label: string; tone: 'neutral' | 'accent' | 'danger' }
> = {
  [CompetitionStatus.draft]: { label: 'Brouillon', tone: 'neutral' },
  [CompetitionStatus.published]: { label: 'Publiée', tone: 'accent' },
  [CompetitionStatus.cancelled]: { label: 'Annulée', tone: 'danger' },
};

/** Badge coloré dérivé du statut de compétition (tokens accent/danger/neutral). */
export function CompetitionStatusBadge({ status }: { status: CompetitionStatus }) {
  const { colors, typography, spacing, radius } = useTheme();
  const meta = COMPETITION_STATUS_UI[status];
  const bg = {
    accent: colors.accentSubtle,
    danger: colors.dangerBg,
    neutral: colors.surfaceSunken,
  }[meta.tone];
  const fg = {
    accent: colors.accentText,
    danger: colors.danger,
    neutral: colors.textSecondary,
  }[meta.tone];
  return (
    <View
      testID={`competition-status-${status}`}
      style={{
        backgroundColor: bg,
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[1],
        borderRadius: radius.pill,
      }}
    >
      <Text
        style={{
          color: fg,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.caption.fontSize,
        }}
      >
        {meta.label}
      </Text>
    </View>
  );
}

/** Libellé + tonalité par statut d'engagement (ADR-24). */
export const COMPETITION_ENTRY_STATUS_UI: Record<
  CompetitionEntryStatus,
  { label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' }
> = {
  [CompetitionEntryStatus.engaged]: { label: 'Engagé', tone: 'accent' },
  [CompetitionEntryStatus.confirmed]: { label: 'Confirmé', tone: 'success' },
  [CompetitionEntryStatus.withdrawn]: { label: 'Forfait', tone: 'danger' },
};

/** Badge coloré dérivé du statut d'engagement. */
export function CompetitionEntryStatusBadge({ status }: { status: CompetitionEntryStatus }) {
  const { colors, typography, spacing, radius } = useTheme();
  const meta = COMPETITION_ENTRY_STATUS_UI[status];
  const bg = {
    accent: colors.accentSubtle,
    success: colors.successBg,
    danger: colors.dangerBg,
    neutral: colors.surfaceSunken,
  }[meta.tone];
  const fg = {
    accent: colors.accentText,
    success: colors.success,
    danger: colors.danger,
    neutral: colors.textSecondary,
  }[meta.tone];
  return (
    <View
      testID={`entry-status-${status}`}
      style={{
        backgroundColor: bg,
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[1],
        borderRadius: radius.pill,
      }}
    >
      <Text
        style={{
          color: fg,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.caption.fontSize,
        }}
      >
        {meta.label}
      </Text>
    </View>
  );
}

/**
 * Période lisible d'une compétition (UTC, pour ne pas décaler une date calendaire) :
 * un seul jour « 1 juil. 2026 », ou une plage « 1 → 3 juil. 2026 ». Renvoie une chaîne vide
 * si la date de début est absente/illisible (lecture défensive).
 */
export function formatCompetitionPeriod(startDate: string, endDate?: string): string {
  const start = parseDay(startDate);
  if (!start) return '';
  const fmt = (d: Date) =>
    d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  const end = endDate ? parseDay(endDate) : null;
  if (!end || sameDay(start, end)) return fmt(start);
  return `${start.toLocaleDateString('fr-FR', { day: 'numeric', timeZone: 'UTC' })} → ${fmt(end)}`;
}

function parseDay(value: string | undefined | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Ligne compétition (liste coach/athlète) : pastille initiale, nom, période + lieu, badge.
 * Pressable vers le détail (athlète) ou l'édition (coach).
 */
export function CompetitionListItem({
  competition,
  onPress,
  testID,
}: {
  competition: Competition;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const period = formatCompetitionPeriod(competition.startDate, competition.endDate);
  const subtitle = [period, competition.location?.trim()].filter(Boolean).join(' · ');
  return (
    <Card testID={testID ?? `competition-item-${competition.id}`} onPress={onPress}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.accentSubtle }]}>
          <Feather name="award" size={18} color={colors.accentText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            numberOfLines={1}
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {competition.name}
          </Text>
          {subtitle ? (
            <Text
              numberOfLines={1}
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: spacing[2] }}>
          <CompetitionStatusBadge status={competition.status} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
