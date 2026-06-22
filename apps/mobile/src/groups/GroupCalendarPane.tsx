import { listAssignments, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { sessionDetailHref } from '../athlete/navigation';
import { SessionsCalendar } from '../calendar/SessionsCalendar';
import { ASSIGNMENTS_QUERY_KEY } from './groups-query';

/**
 * Calendrier **du groupe** dans le hub athlète (ADR-47 §3). Affiche uniquement les séances
 * **programmées par le coach du groupe** : on lit `GET /assignments` (cache partagé) et on filtre
 * `session.coachId === coachId` → exclut les **séances libres** de l'athlète (`self_logged`,
 * coachId = athleteId, ADR-36) et les séances d'un autre coach. Scope par coach faute de provenance
 * de groupe (Lot 2, ADR-30) — répond au besoin « séances du groupe ≠ séances perso ».
 */
export function GroupCalendarPane({ coachId, now = new Date() }: { coachId?: string; now?: Date }) {
  const { colors, spacing, typography } = useTheme();
  const router = useRouter();

  const query = useQuery({
    queryKey: ASSIGNMENTS_QUERY_KEY,
    queryFn: async (): Promise<Assignment[]> => {
      const response = await listAssignments();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  if (query.isLoading) {
    return (
      <View testID="group-calendar-loading" style={{ paddingVertical: spacing[6] }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (query.isError) {
    return (
      <Card testID="group-calendar-error">
        <View style={{ gap: spacing[4] }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Impossible de charger le calendrier du groupe.
          </Text>
          <Button testID="group-calendar-retry" onPress={() => void query.refetch()}>
            Réessayer
          </Button>
        </View>
      </Card>
    );
  }

  // Séances du coach du groupe uniquement (hors séances libres de l'athlète).
  const groupSessions = (query.data ?? []).filter((a) => a.session?.coachId === coachId);

  return (
    <SessionsCalendar
      testIDPrefix="group-calendar"
      assignments={groupSessions}
      onOpen={(a) => router.push(sessionDetailHref(a.id))}
      now={now}
    />
  );
}
