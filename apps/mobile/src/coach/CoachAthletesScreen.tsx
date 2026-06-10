import { getCoachDashboard, type Dashboard } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card } from '../components/ui';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/dashboard-query';
import { coachGroupsHref } from '../groups/navigation';
import { AthleteListItem } from './athlete-ui';
import { athleteDetailHref } from './navigation';

/**
 * Écran Athlètes coach (C-02 — TLX-044). Liste des athlètes liés, dérivée de
 * `GET /coach/dashboard` (`athletes[]`, statut dérivé) — même clé de cache que le
 * tableau de bord (cohérence + pas de requête en double). Chaque ligne ouvre le
 * détail (C-03). États chargement / erreur / vide ; pull-to-refresh.
 */
export function CoachAthletesScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  const dashboard = useQuery({
    queryKey: COACH_DASHBOARD_QUERY_KEY,
    queryFn: async (): Promise<Dashboard> => {
      const response = await getCoachDashboard();
      if (response.status === 200) return response.data;
      throw response;
    },
  });

  if (dashboard.isLoading) {
    return (
      <View
        testID="coach-athletes-loading"
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <View
        testID="coach-athletes-error"
        style={[styles.centered, { backgroundColor: colors.background, padding: spacing[6] }]}
      >
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
            textAlign: 'center',
            marginBottom: spacing[4],
          }}
        >
          Impossible de charger tes athlètes.
        </Text>
        <Button testID="coach-athletes-retry" onPress={() => void dashboard.refetch()}>
          Réessayer
        </Button>
      </View>
    );
  }

  const { athletes } = dashboard.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      refreshControl={
        <RefreshControl
          refreshing={dashboard.isRefetching}
          onRefresh={() => void dashboard.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <View style={{ gap: spacing[1] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h1.fontSize,
            letterSpacing: -0.5,
          }}
        >
          Athlètes
        </Text>
        <Text
          testID="coach-athletes-count"
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {athletes.length} athlète{athletes.length > 1 ? 's' : ''} lié
          {athletes.length > 1 ? 's' : ''}
        </Text>
      </View>

      <Button
        testID="coach-athletes-manage-groups"
        fullWidth
        leftIcon={<Feather name="users" size={18} color={colors.textOnAccent} />}
        onPress={() => router.push(coachGroupsHref())}
      >
        Gérer mes groupes
      </Button>

      {athletes.length === 0 ? (
        <Card testID="coach-athletes-empty">
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Aucun athlète lié. Partage un code de groupe pour qu'un athlète te rejoigne.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {athletes.map((athlete) => (
            <AthleteListItem
              key={athlete.id}
              athlete={athlete}
              testID={`coach-athletes-item-${athlete.id}`}
              onPress={() => router.push(athleteDetailHref(athlete))}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
