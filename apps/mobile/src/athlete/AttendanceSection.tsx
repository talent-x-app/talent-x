import { listAssignments, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Card } from '../components/ui';
import { computeAttendance, hasAttendanceSignal, type Attendance } from './attendance';

/**
 * Section « Assiduité » de l'athlète (TLX-115). Gamification légère de la rétention :
 * **série** de semaines complètes consécutives + **taux de complétion du mois**, dérivés
 * du cache `['assignments']` (partagé A-01/A-02/calendrier) — aucun endpoint dédié, aucun
 * fetch redondant. Masquée tant qu'aucune affectation n'est évaluable (pas de signal).
 */
export function AttendanceSection() {
  const assignmentsQuery = useQuery({
    queryKey: ['assignments'],
    queryFn: async (): Promise<Assignment[]> => {
      const response = await listAssignments();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const list = assignmentsQuery.data;
  const now = new Date();
  const show = !!list && hasAttendanceSignal(list, now);
  const attendance = useMemo(() => (list ? computeAttendance(list, now) : null), [list]);

  // Pas de carte tant qu'il n'y a rien à montrer (chargement, erreur, ou aucune séance échue).
  if (!show || !attendance) return null;

  return <AttendanceCard attendance={attendance} />;
}

/** Carte présentationnelle d'assiduité (testable sans réseau). */
export function AttendanceCard({ attendance }: { attendance: Attendance }) {
  const { colors, typography, spacing, radius } = useTheme();
  const { currentStreakWeeks, bestStreakWeeks, monthCompleted, monthTotal, monthCompletionRate } =
    attendance;
  const ratePct = Math.round(monthCompletionRate * 100);

  return (
    <Card testID="attendance-card">
      <View style={{ gap: spacing[4] }}>
        {/* Série — accroche motivante. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.warningBg,
            }}
          >
            <Feather name="zap" size={22} color={colors.warning} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              testID="attendance-streak"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h3.fontSize,
              }}
            >
              {streakHeadline(currentStreakWeeks)}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {streakSubtitle(currentStreakWeeks, bestStreakWeeks)}
            </Text>
          </View>
        </View>

        {/* Taux de complétion du mois + barre de progression. */}
        <View style={{ gap: spacing[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] }}>
            <Text
              style={{
                flex: 1,
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Ce mois-ci
            </Text>
            <Text
              testID="attendance-month"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {monthCompleted}/{monthTotal} · {ratePct} %
            </Text>
          </View>
          <View
            style={{
              height: 8,
              borderRadius: radius.sm,
              backgroundColor: colors.accentSubtle,
              overflow: 'hidden',
            }}
          >
            <View
              testID="attendance-month-bar"
              style={{
                width: `${ratePct}%`,
                height: '100%',
                borderRadius: radius.sm,
                backgroundColor: colors.accent,
              }}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

/**
 * Pastille compacte de série, pour l'accueil (TLX-115) : rien tant qu'aucune série en cours,
 * sinon un éclair + le nombre de semaines. Présentationnel (le compteur est dérivé en amont).
 */
export function StreakBadge({ weeks }: { weeks: number }) {
  const { colors, typography, spacing, radius } = useTheme();
  if (weeks <= 0) return null;
  return (
    <View
      testID="home-streak-badge"
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[1],
        paddingHorizontal: spacing[2],
        paddingVertical: spacing[1],
        borderRadius: radius.pill,
        backgroundColor: colors.warningBg,
      }}
    >
      <Feather name="zap" size={13} color={colors.warning} />
      <Text
        style={{
          color: colors.warning,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.caption.fontSize,
        }}
      >
        {weeks} semaine{weeks > 1 ? 's' : ''} d'affilée
      </Text>
    </View>
  );
}

/** Titre de la série : neutre tant qu'elle n'est pas amorcée, sinon le décompte de semaines. */
function streakHeadline(weeks: number): string {
  if (weeks <= 0) return 'Lance ta série';
  return `${weeks} semaine${weeks > 1 ? 's' : ''} d'affilée`;
}

/** Sous-titre contextuel : encourage à démarrer, à continuer, ou rappelle le record. */
function streakSubtitle(current: number, best: number): string {
  if (current <= 0) return 'Termine toutes tes séances cette semaine pour démarrer une série.';
  if (best > current) return `Ton record : ${best} semaines. Continue !`;
  return 'Toutes tes séances réalisées — continue comme ça !';
}
