import { type PersonalRecord, type Progress, type ProgressSeries } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { Card, Chip } from '../components/ui';
import { formatSessionDate } from './athlete-session-ui';
import { formatRecordValue } from './perf-entry';
import {
  PROGRESS_WINDOWS,
  barHeights,
  pointsInWindow,
  seriesTrend,
  type ProgressWindow,
} from './progress-series';

/**
 * Composants de rendu de la progression & des records (A-06/A-07), **partagés** entre
 * la vue athlète (`ProgressScreen`) et la vue coach (détail athlète C-03, TLX-112) afin
 * que le coach voie exactement les mêmes graphes/records que l'athlète. Présentationnels
 * (aucune requête) : les écrans fournissent les données déjà chargées.
 */

/** Sélecteur de fenêtre temporelle (Semaine / Mois / Année). */
export function ProgressWindowChips({
  window,
  onChange,
}: {
  window: ProgressWindow;
  onChange: (w: ProgressWindow) => void;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing[2] }}>
      {PROGRESS_WINDOWS.map((w) => (
        <Chip
          key={w.value}
          testID={`progress-window-${w.value}`}
          selected={window === w.value}
          onPress={() => onChange(w.value)}
        >
          {w.label}
        </Chip>
      ))}
    </View>
  );
}

/** Bandeau métriques (dérivations StatsMetrics — ADR-21). */
export function ProgressMetricsRow({ progress }: { progress: Progress }) {
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
export function ProgressSeriesCard({
  series,
  window,
}: {
  series: ProgressSeries;
  window: ProgressWindow;
}) {
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

/** Ligne record : épreuve + marque mise en avant + date (+ badge « manuel »). */
export function RecordRow({ record }: { record: PersonalRecord }) {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <Card testID={`record-${record.eventKey}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentSubtle,
          }}
        >
          <Feather name="award" size={18} color={colors.accentText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {record.label}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {formatSessionDate(record.achievedAt)}
            {record.performanceId == null ? ' · manuel' : ''}
          </Text>
        </View>
        <Text
          testID={`record-${record.eventKey}-value`}
          style={{
            color: colors.accentText,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h3.fontSize,
          }}
        >
          {formatRecordValue(record.value, record.unit)}
        </Text>
      </View>
    </Card>
  );
}
