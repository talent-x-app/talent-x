import {
  getCoachDashboard,
  listAssignments,
  type Assignment,
  type Dashboard,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card } from '../components/ui';
import { AthleteListItem, athleteFullName } from '../coach/athlete-ui';
import { athleteDetailHref } from '../coach/navigation';
import {
  AlertsSection,
  AllClearCard,
  ToReviewSection,
  TodaySection,
  athletesMissingConsent,
  athletesToReview,
  athletesWithOverdue,
  selectTodayAssignments,
} from './dashboard-sections';
import { COACH_DASHBOARD_QUERY_KEY } from './dashboard-query';
import { coachGroupsHref } from '../groups/navigation';

// Ré-exporté pour compat : la source unique est `dashboard-query` (sans dépendance UI).
export { COACH_DASHBOARD_QUERY_KEY };

/**
 * Tableau de bord coach (C-01 — TLX-081). Consomme `GET /coach/dashboard` (dérivations
 * TLX-080) : KPIs (à revoir, aujourd'hui), alertes (retards, consentements manquants)
 * et liste « Tes athlètes » avec statut dérivé. Tous les visuels dérivent des tokens.
 * États : chargement, erreur (réessai), vide (aucun athlète lié). Pull-to-refresh.
 */
export function CoachDashboardScreen() {
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

  // Affectations du coach (role-aware) → section « Aujourd'hui » (TLX-083). Cache partagé
  // avec l'écran athlète et invalidé à l'assignation (TLX-063).
  const assignments = useQuery({
    queryKey: ['assignments'],
    queryFn: async (): Promise<Assignment[]> => {
      const response = await listAssignments();
      if (response.status === 200) return response.data.data;
      throw response;
    },
  });

  const todayAssignments = useMemo(
    () => selectTodayAssignments(assignments.data ?? [], new Date()),
    [assignments.data],
  );
  const athleteNameById = useMemo(
    () => new Map((dashboard.data?.athletes ?? []).map((a) => [a.id, athleteFullName(a)])),
    [dashboard.data],
  );

  if (dashboard.isLoading) {
    return (
      <View
        testID="coach-dashboard-loading"
        style={[styles.centered, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (dashboard.isError || !dashboard.data) {
    return (
      <View
        testID="coach-dashboard-error"
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
          Impossible de charger le tableau de bord.
        </Text>
        <Button testID="coach-dashboard-retry" onPress={() => void dashboard.refetch()}>
          Réessayer
        </Button>
      </View>
    );
  }

  const { athletes, summary } = dashboard.data;

  // « Tout est à jour » (TLX-085) : aucun signal d'aucune section, affectations chargées.
  const allClear =
    athletes.length > 0 &&
    athletesToReview(athletes).length === 0 &&
    athletesWithOverdue(athletes).length === 0 &&
    athletesMissingConsent(athletes).length === 0 &&
    todayAssignments.length === 0 &&
    !assignments.isLoading &&
    !assignments.isError;

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
          Tableau de bord
        </Text>
        <Text
          testID="coach-dashboard-subtitle"
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {summary.athleteCount} athlète{summary.athleteCount > 1 ? 's' : ''} suivi
          {summary.athleteCount > 1 ? 's' : ''}
        </Text>
      </View>

      {/* Entrée vers le constructeur de séance (C-05 — TLX-052). */}
      <Button
        testID="coach-dashboard-new-session"
        fullWidth
        leftIcon={<Feather name="plus" size={18} color={colors.textOnAccent} />}
        onPress={() => router.push('/(coach)/session/new')}
      >
        Nouvelle séance
      </Button>

      {/* KPIs (Carte C-01 §4). */}
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <MetricCard
          testID="coach-dashboard-kpi-toreview"
          label="À revoir"
          value={summary.toReview}
        />
        <MetricCard testID="coach-dashboard-kpi-today" label="Aujourd'hui" value={summary.today} />
      </View>

      {/* Sections (Carte C-01 §4/§5/§6) : « Tout est à jour » remplace les sections quand
          aucun signal (TLX-085) ; sinon alertes détaillées (TLX-084) + À revoir / Aujourd'hui
          (TLX-082/083). */}
      {athletes.length > 0 ? (
        allClear ? (
          <AllClearCard />
        ) : (
          <>
            <AlertsSection
              athletes={athletes}
              onPressAthlete={(athlete) => router.push(athleteDetailHref(athlete))}
            />
            <ToReviewSection
              athletes={athletes}
              onPressAthlete={(athlete) => router.push(athleteDetailHref(athlete))}
            />
            <TodaySection
              assignments={todayAssignments}
              nameById={athleteNameById}
              isLoading={assignments.isLoading}
              isError={assignments.isError}
              onRetry={() => void assignments.refetch()}
              onChanged={() => {
                void assignments.refetch();
                void dashboard.refetch();
              }}
            />
          </>
        )
      ) : null}

      {/* Tes athlètes (Carte C-01 §7). */}
      <View style={{ gap: spacing[3] }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          Tes athlètes
        </Text>

        {athletes.length === 0 ? (
          // Première utilisation (TLX-085, Carte C-01 §6) : accueil + comment lier un athlète.
          <Card testID="coach-dashboard-empty">
            <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] }}>
              <Feather name="users" size={28} color={colors.accentText} />
              <Text
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.bold,
                  fontSize: typography.body.fontSize,
                }}
              >
                Bienvenue sur Talent-X
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                  textAlign: 'center',
                }}
              >
                Aucun athlète lié pour l'instant. Crée un groupe et partage son code pour qu'un
                athlète te rejoigne — tu peux déjà préparer tes séances avec « Nouvelle séance ».
              </Text>
              <Button
                testID="coach-dashboard-manage-groups"
                fullWidth
                leftIcon={<Feather name="users" size={18} color={colors.textOnAccent} />}
                onPress={() => router.push(coachGroupsHref())}
              >
                Gérer mes groupes
              </Button>
            </View>
          </Card>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {athletes.map((athlete) => (
              <AthleteListItem
                key={athlete.id}
                athlete={athlete}
                testID={`coach-dashboard-athlete-${athlete.id}`}
                onPress={() => router.push(athleteDetailHref(athlete))}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/** Carte KPI : grand nombre + libellé. */
function MetricCard({ label, value, testID }: { label: string; value: number; testID?: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card style={{ flex: 1 }} testID={testID}>
      <View style={{ gap: spacing[1] }}>
        <Text
          testID={testID ? `${testID}-value` : undefined}
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h1.fontSize,
          }}
        >
          {value}
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {label}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
