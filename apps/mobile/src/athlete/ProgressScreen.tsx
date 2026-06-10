import { getMyProgress, type Progress, type ProgressSeries } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { formatRecordValue } from './perf-entry';
import { PersonalRecordsSection } from './PersonalRecordsSection';
import {
  PROGRESS_WINDOWS,
  barHeights,
  pointsInWindow,
  seriesTrend,
  type ProgressWindow,
} from './progress-series';

/** Réponse 403 dont le code métier indique un consentement manquant. */
function isConsentRequired(error: unknown): boolean {
  const e = error as { status?: number; data?: { error?: string } } | undefined;
  return e?.status === 403 && e?.data?.error === 'CONSENT_REQUIRED';
}

/**
 * Écran Progression athlète (A-06 — TLX-090, ADR-21) : métriques dérivées + un graphe
 * par épreuve (`GET /athletes/me/progress`), fenêtre Semaine/Mois/Année côté client,
 * puis records personnels (A-07). États chargement / consentement / erreur / vide.
 */
export function ProgressScreen() {
  const { colors, typography, spacing } = useTheme();
  const [window, setWindow] = useState<ProgressWindow>('month');

  const progress = useQuery({
    queryKey: ['progress', 'me'],
    queryFn: async (): Promise<Progress> => {
      const response = await getMyProgress();
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
      <View style={{ gap: spacing[1] }}>
        <Text
          testID="progress-title"
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          Progression
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Tes marques et ta régularité, épreuve par épreuve.
        </Text>
      </View>

      {progress.isLoading ? (
        <View testID="progress-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : progress.isError ? (
        <Card testID={isConsentRequired(progress.error) ? 'progress-consent' : 'progress-error'}>
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              {isConsentRequired(progress.error)
                ? 'Active le consentement « traitement des données » pour voir ta progression.'
                : 'Impossible de charger ta progression.'}
            </Text>
            {!isConsentRequired(progress.error) ? (
              <Button testID="progress-retry" onPress={() => void progress.refetch()}>
                Réessayer
              </Button>
            ) : null}
          </View>
        </Card>
      ) : progress.data ? (
        <>
          <MetricsRow progress={progress.data} />

          {/* Fenêtre temporelle (ADR-21 : segmentation côté client). */}
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {PROGRESS_WINDOWS.map((w) => (
              <Chip
                key={w.value}
                testID={`progress-window-${w.value}`}
                selected={window === w.value}
                onPress={() => setWindow(w.value)}
              >
                {w.label}
              </Chip>
            ))}
          </View>

          {progress.data.series.length === 0 ? (
            <Card testID="progress-empty">
              <View style={{ alignItems: 'center', gap: spacing[2] }}>
                <Feather name="trending-up" size={22} color={colors.textMuted} />
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.body.fontSize,
                    textAlign: 'center',
                  }}
                >
                  Pas encore de mesures — saisis tes perfs sur des blocs typés (sprint, sauts…) pour
                  voir tes courbes.
                </Text>
              </View>
            </Card>
          ) : (
            progress.data.series.map((series) => (
              <SeriesCard key={series.eventKey} series={series} window={window} />
            ))
          )}

          <PersonalRecordsSection />
        </>
      ) : null}
    </ScrollView>
  );
}

/** Bandeau métriques (dérivations StatsMetrics appliquées à soi — ADR-21). */
function MetricsRow({ progress }: { progress: Progress }) {
  const { spacing } = useTheme();
  const m = progress.metrics;
  return (
    <View style={{ flexDirection: 'row', gap: spacing[3] }}>
      <Metric label="Réalisées" value={`${m.completed}/${m.assignmentsTotal}`} />
      <Metric label="Assiduité" value={`${Math.round(m.completionRate * 100)} %`} />
      <Metric label="RPE moyen" value={m.avgRpe != null ? `${m.avgRpe}` : '—'} />
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card style={{ flex: 1 }}>
      <View style={{ gap: spacing[1] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h3.fontSize,
          }}
        >
          {value}
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.caption.fontSize,
          }}
        >
          {label}
        </Text>
      </View>
    </Card>
  );
}

const CHART_HEIGHT = 72;

/** Carte d'épreuve : dernière marque, tendance et barres des marques de la fenêtre. */
function SeriesCard({ series, window }: { series: ProgressSeries; window: ProgressWindow }) {
  const { colors, typography, spacing, radius } = useTheme();
  const points = pointsInWindow(series.points, window, new Date());
  const trend = seriesTrend(points, series.direction);
  const heights = barHeights(points);
  const last = points[points.length - 1];

  return (
    <Card testID={`progress-series-${series.eventKey}`}>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.body.fontSize,
              }}
            >
              {series.label}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {points.length} marque{points.length > 1 ? 's' : ''} sur la période
            </Text>
          </View>
          {trend ? (
            <Feather
              testID={`progress-trend-${series.eventKey}-${trend}`}
              name={trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'minus'}
              size={18}
              color={
                trend === 'up'
                  ? colors.success
                  : trend === 'down'
                    ? colors.danger
                    : colors.textMuted
              }
            />
          ) : null}
          {last ? (
            <Text
              testID={`progress-last-${series.eventKey}`}
              style={{
                color: colors.accentText,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h3.fontSize,
              }}
            >
              {formatRecordValue(last.value, series.unit)}
            </Text>
          ) : null}
        </View>

        {points.length === 0 ? (
          <Text
            testID={`progress-series-${series.eventKey}-empty`}
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Aucune marque sur cette période.
          </Text>
        ) : (
          <View
            style={{
              height: CHART_HEIGHT,
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: spacing[1],
            }}
          >
            {heights.map((h, i) => (
              <View
                key={`${points[i].date}-${i}`}
                testID={`progress-bar-${series.eventKey}-${i}`}
                style={{
                  flex: 1,
                  maxWidth: 28,
                  height: Math.round(CHART_HEIGHT * h),
                  borderRadius: radius.sm,
                  backgroundColor: i === heights.length - 1 ? colors.accent : colors.accentSubtle,
                }}
              />
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}
