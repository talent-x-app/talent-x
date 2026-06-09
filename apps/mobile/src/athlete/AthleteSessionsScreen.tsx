import { listAssignments, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { AssignmentListItem } from './athlete-session-ui';

/** Affectations à venir d'abord, terminées/manquées ensuite ; sinon par date décroissante. */
const STATUS_ORDER: Record<string, number> = {
  assigned: 0,
  in_progress: 0,
  completed: 1,
  skipped: 1,
};

function sortAssignments(list: Assignment[]): Assignment[] {
  return [...list].sort((a, b) => {
    const byStatus = (STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0);
    if (byStatus !== 0) return byStatus;
    const da = a.dueDate ?? a.session?.scheduledDate ?? '';
    const db = b.dueDate ?? b.session?.scheduledDate ?? '';
    return db.localeCompare(da);
  });
}

/**
 * Écran Séances athlète (A-02 — TLX-065). Consomme `GET /assignments` (role-aware :
 * l'athlète reçoit ses séances affectées, séance embarquée). Liste triée (à faire en
 * premier), lignes cliquables vers le détail + saisie de perf (A-03/A-04). États
 * chargement / erreur / vide, pull-to-refresh.
 */
export function AthleteSessionsScreen() {
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

  const assignments = query.data ? sortAssignments(query.data) : [];

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
      <View style={{ gap: spacing[1] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          Séances
        </Text>
        {query.data ? (
          <Text
            testID="sessions-count"
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {assignments.length} séance{assignments.length > 1 ? 's' : ''} affectée
            {assignments.length > 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      {query.isLoading ? (
        <View testID="sessions-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Card testID="sessions-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger tes séances.
            </Text>
            <Button testID="sessions-retry" onPress={() => void query.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : assignments.length === 0 ? (
        <Card testID="sessions-empty">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Aucune séance affectée pour l'instant.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {assignments.map((assignment) => (
            <AssignmentListItem
              key={assignment.id}
              assignment={assignment}
              onPress={() =>
                router.push({
                  pathname: '/(athlete)/session/[id]' as const,
                  params: { id: assignment.id },
                })
              }
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
