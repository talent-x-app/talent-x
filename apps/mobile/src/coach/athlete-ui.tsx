import { AthleteStatus, type DashboardAthlete } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/ui';

/** Libellé + tonalité (token) par statut dérivé (ADR-17). Partagé dashboard ↔ liste. */
export const STATUS_META: Record<
  AthleteStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  [AthleteStatus.up_to_date]: { label: 'À jour', tone: 'success' },
  [AthleteStatus.late]: { label: 'En retard', tone: 'danger' },
  [AthleteStatus.pending_review]: { label: 'À revoir', tone: 'warning' },
};

/**
 * Sévérité d'affichage du statut dérivé (ADR-17, Carte C-01 §8) : retard > à revoir > à jour —
 * même ordre que le badge de statut. Plus bas = plus urgent (remonte en tête de liste).
 */
const STATUS_SEVERITY: Record<AthleteStatus, number> = {
  [AthleteStatus.late]: 0,
  [AthleteStatus.pending_review]: 1,
  [AthleteStatus.up_to_date]: 2,
};

/**
 * Trie « Tes athlètes » (dashboard C-01 + liste C-02) par **sévérité de statut** puis **nom**
 * (alphabétique, accents-aware) — pour un scan cohérent partout (TLX-147). Copie défensive : la
 * liste source n'est jamais mutée. Co-localisé avec `STATUS_META`/`athleteFullName` (module
 * partagé de la ligne-athlète) plutôt que `dashboard-sections`, pour ne pas coupler C-02 à la
 * chaîne UI du dashboard (assignment-lifecycle).
 */
export function sortAthletesByStatus(athletes: DashboardAthlete[]): DashboardAthlete[] {
  return [...athletes].sort((x, y) => {
    const bySeverity = STATUS_SEVERITY[x.status] - STATUS_SEVERITY[y.status];
    if (bySeverity !== 0) return bySeverity;
    return athleteFullName(x).localeCompare(athleteFullName(y), 'fr', { sensitivity: 'base' });
  });
}

/** Badge coloré dérivé du statut (tokens success/warning/danger). */
export function AthleteStatusBadge({ status }: { status: AthleteStatus }) {
  const { colors, typography, spacing, radius } = useTheme();
  const meta = STATUS_META[status];
  const bg = { success: colors.successBg, warning: colors.warningBg, danger: colors.dangerBg }[
    meta.tone
  ];
  const fg = { success: colors.success, warning: colors.warning, danger: colors.danger }[meta.tone];
  return (
    <View
      testID={`status-badge-${status}`}
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

/** Ligne athlète réutilisable (dashboard + liste C-02) : avatar, identité, badge. Pressable. */
export function AthleteListItem({
  athlete,
  onPress,
  testID,
}: {
  athlete: DashboardAthlete;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, typography } = useTheme();
  return (
    <Card testID={testID ?? `athlete-item-${athlete.id}`} onPress={onPress}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.accentSubtle }]}>
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.body.fontSize,
            }}
          >
            {athleteInitials(athlete)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {athleteFullName(athlete)}
          </Text>
          {athlete.sport ? (
            <Text
              style={{
                // Discipline porteuse d'info → textSecondary (AA, TLX-145).
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {athlete.sport}
            </Text>
          ) : null}
        </View>
        <AthleteStatusBadge status={athlete.status} />
      </View>
    </Card>
  );
}

/** Nom complet d'un athlète (fallback « Athlète » si vide). */
export function athleteFullName(a: Pick<DashboardAthlete, 'firstName' | 'lastName'>): string {
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : 'Athlète';
}

/** Initiales d'un athlète (fallback « ? »). */
export function athleteInitials(a: Pick<DashboardAthlete, 'firstName' | 'lastName'>): string {
  const letters = [a.firstName?.[0], a.lastName?.[0]].filter(Boolean).join('');
  return (letters || '?').toUpperCase();
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
