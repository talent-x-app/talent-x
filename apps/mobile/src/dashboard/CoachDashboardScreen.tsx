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
import { ToReviewSection, TodaySection, selectTodayAssignments } from './dashboard-sections';
import { COACH_DASHBOARD_QUERY_KEY } from './dashboard-query';

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

      {/* Alertes (Carte C-01 §5) — affichées seulement si un signal est présent. */}
      <AlertsBanner
        missedSessions={summary.alerts.missedSessions}
        consentMissing={summary.alerts.consentMissing}
      />

      {/* Sections détaillées (Carte C-01 §4) — au-delà des KPIs (TLX-082/083). */}
      {athletes.length > 0 ? (
        <>
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
          />
        </>
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
          <Card testID="coach-dashboard-empty">
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Aucun athlète lié pour l'instant. Partage un code de groupe pour qu'un athlète te
              rejoigne.
            </Text>
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

/** Bandeau d'alertes ; ne s'affiche que si au moins un signal est non nul. */
function AlertsBanner({
  missedSessions,
  consentMissing,
}: {
  missedSessions: number;
  consentMissing: number;
}) {
  const { colors, typography } = useTheme();
  if (missedSessions === 0 && consentMissing === 0) return null;

  const messages: string[] = [];
  if (missedSessions > 0) {
    messages.push(`${missedSessions} séance${missedSessions > 1 ? 's' : ''} en retard`);
  }
  if (consentMissing > 0) {
    messages.push(
      `${consentMissing} consentement${consentMissing > 1 ? 's' : ''} d'accès manquant${
        consentMissing > 1 ? 's' : ''
      }`,
    );
  }

  return (
    <Card
      testID="coach-dashboard-alerts"
      style={{ backgroundColor: colors.warningBg, borderColor: colors.warning }}
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {messages.join(' · ')}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
