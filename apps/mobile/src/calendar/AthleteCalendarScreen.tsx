import {
  listAssignments,
  listCompetitions,
  type Assignment,
  type Competition,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { sessionDetailHref } from '../athlete/navigation';
import { COMPETITIONS_QUERY_KEY } from '../competitions/competitions-query';
import { athleteCompetitionDetailHref, athleteCompetitionsHref } from '../competitions/navigation';
import { CalendarView } from './CalendarView';
import { assignmentToCalendarEntry, competitionToCalendarEntry } from './calendar-model';

/**
 * Calendrier athlète (A-08 — TLX-100). Vue planning dérivée de `GET /assignments` (role-aware :
 * l'athlète reçoit ses séances affectées avec leur échéance). Chaque entrée renvoie au détail
 * séance / saisie de perf (A-03/A-04). États chargement / erreur / vide, pull-to-refresh.
 *
 * Partage la clé de cache `['assignments']` avec l'onglet Séances (A-02) : naviguer entre les
 * deux ne déclenche pas de re-fetch.
 */
export function AthleteCalendarScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  const query = useQuery({
    queryKey: ['assignments'],
    queryFn: async (): Promise<Assignment[]> => {
      const response = await listAssignments();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  // Les compétitions où l'athlète est engagé enrichissent le calendrier (ADR-24 §5).
  const competitions = useQuery({
    queryKey: COMPETITIONS_QUERY_KEY,
    queryFn: async (): Promise<Competition[]> => {
      const response = await listCompetitions();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const entries = [
    ...(query.data ?? []).map(assignmentToCalendarEntry),
    ...(competitions.data ?? []).map(competitionToCalendarEntry),
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h2.fontSize,
        }}
      >
        Calendrier
      </Text>

      <Button
        testID="calendar-competitions-link"
        variant="secondary"
        onPress={() => router.push(athleteCompetitionsHref())}
      >
        Mes compétitions
      </Button>

      {query.isLoading ? (
        <View testID="calendar-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Card testID="calendar-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger ton calendrier.
            </Text>
            <Button testID="calendar-retry" onPress={() => void query.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : (
        <>
          {entries.length === 0 ? (
            <Card testID="calendar-empty">
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                Aucune séance planifiée pour l'instant.
              </Text>
            </Card>
          ) : null}
          <CalendarView
            entries={entries}
            now={new Date()}
            testIDPrefix="calendar"
            onPressEntry={(entry) =>
              router.push(
                entry.kind === 'competition'
                  ? athleteCompetitionDetailHref(entry.id)
                  : sessionDetailHref(entry.id),
              )
            }
          />
        </>
      )}
    </ScrollView>
  );
}
