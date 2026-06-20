import { type Assignment, AssignmentStatus } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { Card } from '../components/ui';
import {
  ASSIGNMENT_STATUS_META,
  AssignmentStatusBadge,
  formatSessionDate,
  sessionTitle,
} from '../athlete/athlete-session-ui';
import { sessionDiscipline, sessionExpectsPerformance } from '../progress/session-discipline';
import { sessionPhrase } from '../sessions/session-summary';
import { disciplineVisual, type DisciplineVisual } from './discipline-ui';

/**
 * Présentation du fil de séances du hub de groupe (ADR-43) : pastille/tag de discipline et badge
 * « perf attendue » **dérivés** des blocs typés (ADR-43 §2/§3, aucun champ stocké), ligne de séance
 * compacte (partagée fil ↔ calendrier) et carte « next-up ». Tout est lecture seule (Phase A) :
 * la présence et la saisie de perf arrivent en Phase B.
 */

/** Pastille colorée d'une discipline (calendrier) — couleur résolue via token (TLX-145). */
export function DisciplineDot({ visual, testID }: { visual: DisciplineVisual; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors[visual.colorKey] as string,
      }}
    />
  );
}

/** Tag de discipline (icône + libellé), teinté du token de la discipline. */
export function DisciplineTag({ visual, testID }: { visual: DisciplineVisual; testID?: string }) {
  const { colors, typography, spacing, radius } = useTheme();
  const color = colors[visual.colorKey] as string;
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[1],
        paddingHorizontal: spacing[2],
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: colors.accentSubtle,
      }}
    >
      <Feather name={visual.icon} size={11} color={color} />
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

/** Tag « perf à saisir » (warning) — dérivé, affiché si la séance attend une perf (ADR-43 §3). */
export function PerfTag({ testID }: { testID?: string }) {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[1],
        paddingHorizontal: spacing[2],
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: colors.warningBg,
      }}
    >
      <Feather name="clock" size={11} color={colors.warning} />
      <Text
        style={{
          color: colors.warning,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.caption.fontSize,
        }}
      >
        Perf à saisir
      </Text>
    </View>
  );
}

/** Discipline + perf attendue dérivées d'une affectation (helper interne réutilisé). */
function derive(assignment: Assignment): { visual: DisciplineVisual | null; expectsPerf: boolean } {
  const items = assignment.session?.exercises?.items;
  const visual = disciplineVisual(sessionDiscipline(items));
  const expectsPerf =
    sessionExpectsPerformance(items) && assignment.status !== AssignmentStatus.completed;
  return { visual, expectsPerf };
}

/**
 * Ligne de séance **compacte** (maquette `.hrow`) — partagée par le fil Séances et le détail d'un
 * jour du calendrier. Barre de discipline à gauche, date + titre, tags (discipline + perf), badge
 * de statut. Tapable vers le détail de séance.
 */
export function GroupSessionRow({
  assignment,
  onPress,
  testID,
}: {
  assignment: Assignment;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const { visual, expectsPerf } = derive(assignment);
  const date = assignment.dueDate ?? assignment.session?.scheduledDate;

  return (
    <Card testID={testID ?? `group-session-${assignment.id}`} onPress={onPress} padded={false}>
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        <View
          style={{
            width: 3,
            borderTopLeftRadius: 14,
            borderBottomLeftRadius: 14,
            backgroundColor: visual ? (colors[visual.colorKey] as string) : colors.border,
          }}
        />
        <View style={{ flex: 1, padding: spacing[3], gap: spacing[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.body.fontSize,
              }}
            >
              {sessionTitle(assignment)}
            </Text>
            <AssignmentStatusBadge status={assignment.status} />
          </View>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {date ? formatSessionDate(date) : 'Sans date'}
          </Text>
          {visual || expectsPerf ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1] }}>
              {visual ? (
                <DisciplineTag visual={visual} testID={`${testID ?? assignment.id}-disc`} />
              ) : null}
              {expectsPerf ? <PerfTag testID={`${testID ?? assignment.id}-perf`} /> : null}
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

/**
 * Carte « next-up » (maquette `.hero`) : prochaine séance actionnable, mise en avant — date, titre,
 * tags dérivés, phrase de synthèse, statut. L'emplacement présence (Phase B) n'est pas rendu ici.
 */
export function NextUpCard({
  assignment,
  onPress,
  testID,
}: {
  assignment: Assignment;
  onPress?: () => void;
  testID?: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const { visual, expectsPerf } = derive(assignment);
  const date = assignment.dueDate ?? assignment.session?.scheduledDate;
  const phrase = sessionPhrase(assignment.session?.exercises?.items ?? []);
  const meta = ASSIGNMENT_STATUS_META[assignment.status];

  return (
    <Card testID={testID ?? 'group-next-up'} onPress={onPress}>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text
            style={{
              flex: 1,
              color: colors.accentText,
              fontFamily: typography.fontFamily.semibold,
              fontSize: typography.caption.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.7,
            }}
          >
            À faire · ta prochaine séance
          </Text>
          {date ? (
            <View
              style={{
                paddingHorizontal: spacing[2],
                paddingVertical: 3,
                borderRadius: radius.pill,
                borderWidth: borderWidth.hairline,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.caption.fontSize,
                }}
              >
                {formatSessionDate(date)}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h3.fontSize,
          }}
        >
          {sessionTitle(assignment)}
        </Text>

        {visual || expectsPerf ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1] }}>
            {visual ? <DisciplineTag visual={visual} testID="group-next-up-disc" /> : null}
            {expectsPerf ? <PerfTag testID="group-next-up-perf" /> : null}
          </View>
        ) : null}

        {phrase !== '' ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {phrase}
          </Text>
        ) : null}

        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.caption.fontSize,
          }}
        >
          {meta.label}
        </Text>
      </View>
    </Card>
  );
}
