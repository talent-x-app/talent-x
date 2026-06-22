import { listAssignments, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { sessionDetailHref } from '../athlete/navigation';
import { athleteCompetitionsHref } from '../competitions/navigation';
import { SessionsCalendar } from './SessionsCalendar';

/**
 * Calendrier athlète (A-08, refondu ADR-47) — vue **mois/semaine** de **toutes** les séances
 * affectées (`GET /assignments`, partagé avec l'onglet Séances). Chaque jour → ses séances
 * (tap = détail/saisie). Lien vers les compétitions conservé (les compétitions comme entrées du
 * calendrier sont différées, ADR-47). États chargement / erreur, pull-to-refresh.
 */
export function AthleteCalendarScreen({ embedded = false }: { embedded?: boolean } = {}) {
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
      {!embedded ? (
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          Calendrier
        </Text>
      ) : null}

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
        <SessionsCalendar
          testIDPrefix="calendar"
          assignments={query.data ?? []}
          onOpen={(a) => router.push(sessionDetailHref(a.id))}
        />
      )}
    </ScrollView>
  );
}
