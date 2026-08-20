import { AssignmentStatus, SessionStatus, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { countLeaves } from '../sessions/exercises-doc';
import { SESSION_STATUS_META } from '../sessions/session-status-meta';
import { sessionDiscipline } from '../progress/session-discipline';
import { disciplineVisual } from '../groups/discipline-ui';

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text
              style={{
                // Date + nb d'exercices porteurs d'info → textSecondary (AA, TLX-145).
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {date ? formatSessionDate(date) : 'Sans date'}
              {' · '}
              {exerciseCount(assignment)} exercice{exerciseCount(assignment) > 1 ? 's' : ''}
            </Text>
            <DisciplineInlineTag assignment={assignment} />
            <SelfLoggedInlineTag assignment={assignment} />
          </View>
        </View>
        <AssignmentStatusBadge status={assignment.status} />
      </View>
    </Card>
  );
}

/**
 * Étiquette « Séance libre » (TLX-249). Le badge de statut d'affectation dit « Réalisée » pour une
 * séance libre comme pour une séance du coach : rien ne les distinguait dans la liste, alors que
 * la séparation plan du coach ⇄ entraînement libre est structurante (ADR-36 §3/§4) — elle décide
 * de ce que le coach voit. Le libellé vient de `SESSION_STATUS_META`, seule définition du concept.
 */
function SelfLoggedInlineTag({ assignment }: { assignment: Pick<Assignment, 'session'> }) {
  const { colors, typography, spacing, radius } = useTheme();
  if (assignment.session?.status !== SessionStatus.self_logged) return null;
  return (
    <View
      testID="session-self-logged"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing[2],
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceSunken,
      }}
    >
      <Feather name="edit-3" size={10} color={colors.textSecondary} />
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.caption.fontSize,
        }}
      >
        {SESSION_STATUS_META[SessionStatus.self_logged].label}
      </Text>
    </View>
  );
}

/**
 * Tag de discipline **dérivé** des blocs typés de la séance (ADR-43 §2, conservé par ADR-44 §5).
 * Rendu seulement si une discipline se dégage (`none` → rien). Couleur via token (TLX-145).
 */
function DisciplineInlineTag({ assignment }: { assignment: Pick<Assignment, 'session'> }) {
  const { colors, typography, spacing, radius } = useTheme();
  const visual = disciplineVisual(sessionDiscipline(assignment.session?.exercises?.items));
  if (!visual) return null;
  const color = colors[visual.colorKey] as string;
  return (
    <View
      testID={`session-discipline-${visual.key}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing[2],
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: colors.accentSubtle,
      }}
    >
      <Feather name={visual.icon} size={10} color={color} />
      <Text
        style={{
          color,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.caption.fontSize,
        }}
      >
        {visual.label}
      </Text>
    </View>
  );
}

/**
 * Jour relatif lisible (« aujourd'hui », « demain », « hier », « dans 3 j », « il y a 2 j »).
 * Comparaison sur les **jours calendaires** locaux (heures ignorées). `undefined` si date invalide.
 */
export function relativeDay(iso: string, now: Date = new Date()): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return 'demain';
  if (diff === -1) return 'hier';
  return diff > 0 ? `dans ${diff} j` : `il y a ${-diff} j`;
}

/**
 * En-tête éditorial du détail séance athlète (A-03, TLX-219) : liseré couleur-discipline (ADR-56),
 * pastille de discipline + badge d'état d'affectation, titre, date + jour relatif. La couleur de
 * discipline est **dérivée** des blocs typés (ADR-43 §2), `accent` par défaut si non typée.
 */
export function SessionHero({ assignment }: { assignment: Assignment }) {
  const { colors, typography, spacing, radius } = useTheme();
  const visual = disciplineVisual(sessionDiscipline(assignment.session?.exercises?.items));
  const accent = visual ? (colors[visual.colorKey] as string) : colors.accent;
  const date = assignment.session?.scheduledDate ?? assignment.dueDate;
  const rel = date ? relativeDay(date) : undefined;
  return (
    <View style={{ flexDirection: 'row', gap: spacing[3] }}>
      <View
        style={{
          width: 4,
          borderRadius: radius.pill,
          backgroundColor: accent,
          alignSelf: 'stretch',
        }}
      />
      <View style={{ flex: 1, gap: spacing[2] }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' }}
        >
          {visual ? (
            <View
              testID={`session-discipline-${visual.key}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Feather name={visual.icon} size={13} color={accent} />
              <Text
                style={{
                  color: accent,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.caption.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                {visual.label}
              </Text>
            </View>
          ) : null}
          <AssignmentStatusBadge status={assignment.status} />
        </View>
        <Text
          testID="session-detail-title"
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          {sessionTitle(assignment)}
        </Text>
        {date ? (
          <Text
            testID="session-detail-date"
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {formatSessionDate(date)}
            {rel ? ` · ${rel}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Titre de la séance d'une affectation (fallback « Séance »). */
export function sessionTitle(assignment: Pick<Assignment, 'session'>): string {
  const title = assignment.session?.title?.trim();
  return title && title.length > 0 ? title : 'Séance';
}

/** Nombre d'exercices (feuilles) de la séance — un groupe de 3 compte 3 (ADR-27). */
export function exerciseCount(assignment: Pick<Assignment, 'session'>): number {
  return countLeaves(assignment.session?.exercises?.items);
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
