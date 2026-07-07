import { getTeamPulse, type TeamPulse } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { groupPulseQueryKey } from './groups-query';

/**
 * Pouls d'équipe (ADR-48, Palier 1) — carte de gamification douce, **collective et anonyme** :
 * trois entiers agrégés et dérivés (séances terminées, records, taux de présence) sur la semaine
 * en cours, jamais d'identité ni de perf comparée entre pairs (frontière santé/perf ADR-08/21).
 * Source : `GET /groups/:id/pulse`. Silencieuse si rien à montrer (semaine creuse).
 */
export function TeamPulseCard({ groupId }: { groupId: string }) {
  const { colors, typography, spacing } = useTheme();

  const query = useQuery({
    queryKey: groupPulseQueryKey(groupId),
    queryFn: async (): Promise<TeamPulse> => {
      const response = await getTeamPulse(groupId);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  if (query.isLoading) {
    return (
      <View testID="team-pulse-loading" style={{ paddingVertical: spacing[3] }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Échec silencieux : le pouls est un bonus, jamais un bloquant — on n'affiche pas d'erreur.
  if (query.isError || !query.data) return null;

  const pulse = query.data;
  // Semaine sans activité : on n'affiche pas une carte vide démotivante.
  const isEmpty =
    pulse.completedSessions === 0 && pulse.personalRecords === 0 && pulse.attendanceRate === null;
  if (isEmpty) return null;

  return (
    <Card testID="team-pulse">
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <View
            testID="team-pulse-live"
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }}
          />
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.caption.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Pouls d'équipe · cette semaine
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <PulseStat
            testID="team-pulse-sessions"
            value={String(pulse.completedSessions)}
            label="séances"
            tone="accent"
          />
          <PulseStat
            testID="team-pulse-records"
            value={pulse.personalRecords > 0 ? `+${pulse.personalRecords}` : '0'}
            label="records 🏅"
            tone="success"
          />
          <PulseStat
            testID="team-pulse-attendance"
            value={pulse.attendanceRate === null ? '—' : `${pulse.attendanceRate}%`}
            label="présence"
            tone="neutral"
          />
        </View>
      </View>
    </Card>
  );
}

/** Tuile métrique : grand entier + libellé, teinte selon la nature de la donnée. */
function PulseStat({
  value,
  label,
  tone,
  testID,
}: {
  value: string;
  label: string;
  tone: 'accent' | 'success' | 'neutral';
  testID: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const valueColor =
    tone === 'accent'
      ? colors.accentText
      : tone === 'success'
        ? colors.success
        : colors.textPrimary;

  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        gap: 2,
        paddingVertical: spacing[3],
        paddingHorizontal: spacing[2],
        backgroundColor: colors.surfaceSunken,
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.border,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: valueColor,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h3.fontSize,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.caption.fontSize,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
