import { getAssignment, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from '../components/ui';
import {
  AssignmentStatusBadge,
  formatSessionDate,
  sessionTitle,
} from '../athlete/athlete-session-ui';
import { SessionContent } from '../sessions/session-content-ui';
import { sessionDiscipline, sessionExpectsPerformance } from '../progress/session-discipline';
import { assignmentQueryKey } from './groups-query';
import { disciplineVisual } from './discipline-ui';
import { DisciplineTag, PerfTag } from './group-session-ui';
import { FeedError } from './group-states-ui';
import { PresenceControl } from './presence-ui';

/**
 * Détail **lecture seule** d'une séance depuis le hub de groupe (ADR-43, TLX-173 Phase A) :
 * en-tête (discipline dérivée, titre, date, statut), puis objectif + déroulé via `SessionContent`
 * (réutilisé). L'emplacement présence et la saisie de perf sont câblés en Phase B. Le « feedback
 * coach » n'est pas rendu : aucun champ du contrat ne le porte (cf. ADR-43, hors périmètre Phase A).
 */
export function GroupSessionDetailScreen({ assignmentId }: { assignmentId: string }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  const query = useQuery({
    queryKey: assignmentQueryKey(assignmentId),
    queryFn: async (): Promise<Assignment> => {
      const response = await getAssignment(assignmentId);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const assignment = query.data;
  const items = assignment?.session?.exercises?.items;
  const visual = items ? disciplineVisual(sessionDiscipline(items)) : null;
  const expectsPerf =
    !!assignment && sessionExpectsPerformance(items) && assignment.status !== 'completed';
  const date = assignment?.dueDate ?? assignment?.session?.scheduledDate;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[5], gap: spacing[5] }}
    >
      <Pressable
        testID="group-session-back"
        accessibilityRole="button"
        accessibilityLabel="Retour"
        onPress={() => router.back()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
      >
        <Feather name="chevron-left" size={22} color={colors.textSecondary} />
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Retour
        </Text>
      </Pressable>

      {query.isLoading ? (
        <View testID="group-session-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError || !assignment ? (
        <FeedError
          testID="group-session-error"
          message="Impossible de charger la séance."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <View style={{ gap: spacing[3] }}>
            {visual || expectsPerf ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1] }}>
                {visual ? <DisciplineTag visual={visual} testID="group-session-disc" /> : null}
                {expectsPerf ? <PerfTag testID="group-session-perf" /> : null}
              </View>
            ) : null}
            <Text
              testID="group-session-title"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h2.fontSize,
              }}
            >
              {sessionTitle(assignment)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {date ? formatSessionDate(date) : 'Sans date'}
              </Text>
              <AssignmentStatusBadge status={assignment.status} />
            </View>
          </View>

          {/* Présence (ADR-43 §1) — déclarable tant que la séance est exécutable. */}
          {assignment.status !== 'completed' ? (
            <Card>
              <PresenceControl assignment={assignment} />
            </Card>
          ) : null}

          <SessionContent
            exercises={assignment.session?.exercises?.items ?? []}
            brief={assignment.session?.brief}
          />
        </>
      )}
    </ScrollView>
  );
}
