import { AssignmentStatus, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/ui';

/** Libellé + tonalité (token) par statut d'affectation. Partagé liste ↔ détail. */
export const ASSIGNMENT_STATUS_META: Record<
  AssignmentStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  [AssignmentStatus.assigned]: { label: 'À faire', tone: 'neutral' },
  [AssignmentStatus.in_progress]: { label: 'En cours', tone: 'warning' },
  [AssignmentStatus.completed]: { label: 'Réalisée', tone: 'success' },
  [AssignmentStatus.skipped]: { label: 'Manquée', tone: 'danger' },
};

/** Badge coloré dérivé du statut d'affectation (tokens success/warning/danger/neutral). */
export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const { colors, typography, spacing, radius } = useTheme();
  const meta = ASSIGNMENT_STATUS_META[status];
  const bg = {
    success: colors.successBg,
    warning: colors.warningBg,
    danger: colors.dangerBg,
    neutral: colors.surfaceSunken,
  }[meta.tone];
  const fg = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    neutral: colors.textSecondary,
  }[meta.tone];
  return (
    <View
      testID={`assignment-status-${status}`}
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

/** Ligne séance affectée (A-02) : titre, date, badge. Pressable vers le détail. */
export function AssignmentListItem({
  assignment,
  onPress,
  testID,
}: {
  assignment: Assignment;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, typography } = useTheme();
  const date = assignment.dueDate ?? assignment.session?.scheduledDate;
  return (
    <Card testID={testID ?? `session-item-${assignment.id}`} onPress={onPress}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.accentSubtle }]}>
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.body.fontSize,
            }}
          >
            {(assignment.session?.title ?? 'S').charAt(0).toUpperCase()}
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
            {sessionTitle(assignment)}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {date ? formatSessionDate(date) : 'Sans date'}
            {' · '}
            {exerciseCount(assignment)} exercice{exerciseCount(assignment) > 1 ? 's' : ''}
          </Text>
        </View>
        <AssignmentStatusBadge status={assignment.status} />
      </View>
    </Card>
  );
}

/** Titre de la séance d'une affectation (fallback « Séance »). */
export function sessionTitle(assignment: Pick<Assignment, 'session'>): string {
  const title = assignment.session?.title?.trim();
  return title && title.length > 0 ? title : 'Séance';
}

/** Nombre d'exercices de la séance (0 si non chargée). */
export function exerciseCount(assignment: Pick<Assignment, 'session'>): number {
  return assignment.session?.exercises?.items?.length ?? 0;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Date courte FR (ex. « 5 févr. 2026 »). Partagée par les écrans athlète. */
export function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}
