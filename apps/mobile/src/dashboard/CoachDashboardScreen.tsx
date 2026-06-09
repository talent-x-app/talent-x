import {
  AthleteStatus,
  getCoachDashboard,
  type Dashboard,
  type DashboardAthlete,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Card } from '../components/ui';

/** Clé de cache du tableau de bord coach. */
export const COACH_DASHBOARD_QUERY_KEY = ['coach', 'dashboard'] as const;

/** Libellé + tonalité (token) par statut dérivé (ADR-17). */
const STATUS_META: Record<
  AthleteStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  [AthleteStatus.up_to_date]: { label: 'À jour', tone: 'success' },
  [AthleteStatus.late]: { label: 'En retard', tone: 'danger' },
  [AthleteStatus.pending_review]: { label: 'À revoir', tone: 'warning' },
};

/**
 * Tableau de bord coach (C-01 — TLX-081). Consomme `GET /coach/dashboard` (dérivations
 * TLX-080) : KPIs (à revoir, aujourd'hui), alertes (retards, consentements manquants)
 * et liste « Tes athlètes » avec statut dérivé. Tous les visuels dérivent des tokens.
 * États : chargement, erreur (réessai), vide (aucun athlète lié). Pull-to-refresh.
 */
export function CoachDashboardScreen() {
  const { colors, typography, spacing } = useTheme();

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
              <AthleteRow key={athlete.id} athlete={athlete} />
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

/** Ligne athlète : avatar (initiales), identité, badge de statut dérivé. */
function AthleteRow({ athlete }: { athlete: DashboardAthlete }) {
  const { colors, typography } = useTheme();
  return (
    <Card testID={`coach-dashboard-athlete-${athlete.id}`}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.accentSubtle }]}>
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.body.fontSize,
            }}
          >
            {initials(athlete)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {fullName(athlete)}
          </Text>
          {athlete.sport ? (
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {athlete.sport}
            </Text>
          ) : null}
        </View>
        <StatusBadge status={athlete.status} />
      </View>
    </Card>
  );
}

/** Badge coloré dérivé du statut (tokens success/warning/danger). */
function StatusBadge({ status }: { status: AthleteStatus }) {
  const { colors, typography, spacing, radius } = useTheme();
  const meta = STATUS_META[status];
  const bg = { success: colors.successBg, warning: colors.warningBg, danger: colors.dangerBg }[
    meta.tone
  ];
  const fg = { success: colors.success, warning: colors.warning, danger: colors.danger }[meta.tone];
  return (
    <View
      testID={`status-badge-${status}`}
      style={{
        backgroundColor: bg,
        paddingHorizontal: spacing[3],
        paddingVertical: spacing[1],
        borderRadius: radius.pill,
      }}
    >
      <Text
        style={{
          color: fg,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.caption.fontSize,
        }}
      >
        {meta.label}
      </Text>
    </View>
  );
}

function fullName(a: DashboardAthlete): string {
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : 'Athlète';
}

function initials(a: DashboardAthlete): string {
  const letters = [a.firstName?.[0], a.lastName?.[0]].filter(Boolean).join('');
  return (letters || '?').toUpperCase();
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
