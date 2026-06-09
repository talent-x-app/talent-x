import { getAthleteStats, type AthleteStatus, type Stats } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { AthleteStatusBadge } from './athlete-ui';

/** Réponse 403 dont le code métier indique un consentement manquant. */
function isConsentRequired(error: unknown): boolean {
  const e = error as { status?: number; data?: { error?: string } } | undefined;
  return e?.status === 403 && e?.data?.error === 'CONSENT_REQUIRED';
}

/**
 * Écran Détail athlète (C-03 — TLX-045). Consomme `GET /athletes/:id/stats` (dérivations
 * TLX-080, consent-gated). L'identité (nom, statut, sport) arrive en paramètres de route
 * (le endpoint stats ne renvoie que les métriques). Gère le cas consentement manquant
 * (403 CONSENT_REQUIRED) par un message dédié. États chargement / erreur.
 */
export function AthleteDetailScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    status?: string;
    sport?: string;
  }>();
  const id = params.id;
  const name = params.name && params.name.length > 0 ? params.name : 'Athlète';

  const stats = useQuery({
    queryKey: ['athlete', id, 'stats'],
    queryFn: async (): Promise<Stats> => {
      const response = await getAthleteStats(id);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      {/* En-tête : retour + identité + statut. */}
      <Pressable
        testID="athlete-detail-back"
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Retour"
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
          Athlètes
        </Text>
      </Pressable>

      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: colors.accentSubtle }]}>
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.h3.fontSize,
            }}
          >
            {initialsFromName(name)}
          </Text>
        </View>
        <View style={{ flex: 1, gap: spacing[1] }}>
          <Text
            testID="athlete-detail-name"
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.h2.fontSize,
            }}
          >
            {name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            {params.status ? <AthleteStatusBadge status={params.status as AthleteStatus} /> : null}
            {params.sport ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {params.sport}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      <StatsSection stats={stats} />
    </ScrollView>
  );
}

/** Section métriques : gère chargement / consentement manquant / erreur / données. */
function StatsSection({ stats }: { stats: UseQueryResult<Stats, unknown> }) {
  const { colors, typography, spacing } = useTheme();

  if (stats.isLoading) {
    return (
      <View testID="athlete-detail-loading" style={{ paddingVertical: spacing[6] }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (stats.isError || !stats.data) {
    const consent = isConsentRequired(stats.error);
    return (
      <Card testID={consent ? 'athlete-detail-consent' : 'athlete-detail-error'}>
        <View style={{ gap: spacing[4] }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            {consent
              ? "Cet athlète n'a pas autorisé l'accès à ses données (consentement requis)."
              : 'Impossible de charger les statistiques.'}
          </Text>
          {!consent ? (
            <Button testID="athlete-detail-retry" onPress={() => void stats.refetch()}>
              Réessayer
            </Button>
          ) : null}
        </View>
      </Card>
    );
  }

  const m = stats.data.metrics;
  const rate = Math.round((m.completionRate ?? 0) * 100);
  return (
    <View style={{ gap: spacing[3] }}>
      <SectionTitle>Statistiques</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }}>
        <Metric
          testID="athlete-stat-done"
          label="Réalisées"
          value={`${m.completed}/${m.assignmentsTotal}`}
        />
        <Metric testID="athlete-stat-rate" label="Assiduité" value={`${rate} %`} />
        <Metric testID="athlete-stat-missed" label="Manquées" value={`${m.missed}`} />
        <Metric
          testID="athlete-stat-rpe"
          label="RPE moyen"
          value={m.avgRpe != null ? `${m.avgRpe}` : '—'}
        />
      </View>
      <Card>
        <View style={{ gap: spacing[1] }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Dernière performance
          </Text>
          <Text
            testID="athlete-stat-last"
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
            }}
          >
            {m.lastPerformanceAt ? formatDate(m.lastPerformanceAt) : 'Aucune'}
          </Text>
        </View>
      </Card>
    </View>
  );
}

function Metric({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card style={{ flexGrow: 1, flexBasis: '45%' }} testID={testID}>
      <View style={{ gap: spacing[1] }}>
        <Text
          testID={testID ? `${testID}-value` : undefined}
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
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

function SectionTitle({ children }: { children: string }) {
  const { colors, typography } = useTheme();
  return (
    <Text
      style={{
        color: colors.textSecondary,
        fontFamily: typography.fontFamily.medium,
        fontSize: typography.bodySm.fontSize,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  const letters = [parts[0]?.[0], parts[1]?.[0]].filter(Boolean).join('');
  return (letters || '?').toUpperCase();
}

/** Date courte FR (ex. « 5 févr. 2026 »). */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
