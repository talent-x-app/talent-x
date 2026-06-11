import {
  listCompetitions,
  listSessions,
  SessionStatus,
  type Competition,
  type Session,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { COMPETITIONS_QUERY_KEY } from '../competitions/competitions-query';
import { coachCompetitionsHref, competitionEditHref } from '../competitions/navigation';
import { CalendarView } from './CalendarView';
import { competitionToCalendarEntry, sessionToCalendarEntry } from './calendar-model';

/**
 * Calendrier coach (C-09 — TLX-100). Vue planning dérivée de `GET /sessions` (role-aware :
 * le coach reçoit ses propres séances avec leur date planifiée). Chaque entrée renvoie au
 * constructeur de séance (C-05) pour ajuster la planification. États chargement / erreur / vide,
 * pull-to-refresh. Les séances sans date planifiée apparaissent dans « Sans date ».
 */
export function CoachCalendarScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  const query = useQuery({
    queryKey: ['sessions'],
    queryFn: async (): Promise<Session[]> => {
      const response = await listSessions();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  // Les compétitions enrichissent le calendrier (ADR-24 §5) en entrées distinctes. Erreur
  // tolérée : le planning séances reste affiché si l'appel compétitions échoue.
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
    // Les modèles (C-10, ADR-29) ne sont pas des séances planifiées → exclus du calendrier.
    ...(query.data ?? [])
      .filter((session) => session.status !== SessionStatus.template)
      .map(sessionToCalendarEntry),
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
        onPress={() => router.push(coachCompetitionsHref())}
      >
        Gérer les compétitions
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
              Impossible de charger le calendrier.
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
                Aucune séance planifiée. Crée une séance pour la voir ici.
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
                  ? competitionEditHref(entry.id)
                  : { pathname: '/(coach)/session/[id]', params: { id: entry.id } },
              )
            }
          />
        </>
      )}
    </ScrollView>
  );
}
