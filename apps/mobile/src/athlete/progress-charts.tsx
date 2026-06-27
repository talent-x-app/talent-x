import {
  type PersonalRecord,
  type Progress,
  type ProgressPoint,
  type ProgressSeries,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { type LayoutChangeEvent, Text, View } from 'react-native';
import { Card, Chip } from '../components/ui';
import { formatSessionDate } from './athlete-session-ui';
import { formatRecordValue } from './perf-entry';
import {
  PROGRESS_WINDOWS,
  bestIndex,
  perfHeights,
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

/** Date compacte « JJ/MM » à partir d'une clé `YYYY-MM-DD` (axe de la courbe). */
function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Carte d'épreuve : dernière marque, tendance et courbe des marques de la fenêtre (R9). */
export function ProgressSeriesCard({
  series,
  window,
}: {
  series: ProgressSeries;
  window: ProgressWindow;
}) {
  const { colors, typography, spacing } = useTheme();
  const points = pointsInWindow(series.points, window, new Date());
  const trend = seriesTrend(points, series.direction);
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
          <ProgressSparkline
            points={points}
            direction={series.direction}
            eventKey={series.eventKey}
          />
        )}

        {/* Saison & carrière (ADR-34) : SB de l'année en cours + tableau des marques par année. */}
        {series.marksByYear.length > 0 ? (
          <View
            style={{
              gap: spacing[2],
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: spacing[3],
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text
                style={{
                  flex: 1,
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.caption.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Meilleure de la saison
              </Text>
              <Text
                testID={`progress-sb-${series.eventKey}`}
                style={{
                  color: series.seasonBest ? colors.accentText : colors.textMuted,
                  fontFamily: typography.fontFamily.bold,
                  fontSize: typography.body.fontSize,
                }}
              >
                {series.seasonBest
                  ? `${formatRecordValue(series.seasonBest.value, series.unit)} · ${series.seasonBest.date.slice(0, 4)}`
                  : '—'}
              </Text>
            </View>
            <View style={{ gap: 2 }}>
              {series.marksByYear.map((y) => (
                <View
                  key={y.year}
                  testID={`progress-year-${series.eventKey}-${y.year}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
                >
                  <Text
                    style={{
                      flex: 1,
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    {y.year}
                  </Text>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    {formatRecordValue(y.best, series.unit)}
                  </Text>
                  <Text
                    style={{
                      width: 64,
                      textAlign: 'right',
                      color: colors.textMuted,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.caption.fontSize,
                    }}
                  >
                    {y.count} marque{y.count > 1 ? 's' : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Courbe de progression (R9) — sparkline **ligne + points** dessinée en `View` (sans dépendance
 * SVG, rendu identique web/natif), calée sur le design system (`design/preview/comp-charts.html`) :
 * 3 lignes de grille, segments accent reliant les marques, **point culminant** (best) surligné d'un
 * anneau, point **final** plein, et dates **début → fin** sous l'axe. Orientée par la performance
 * (meilleure marque toujours plus haute, chrono inclus — corrige le bar-chart brut précédent).
 *
 * Les **points** sont positionnés en pourcentage (donc rendus sans mesure de largeur — testables) ;
 * seuls les **segments** (rotation) requièrent la largeur mesurée via `onLayout`.
 */
function ProgressSparkline({
  points,
  direction,
  eventKey,
}: {
  points: ProgressPoint[];
  direction: ProgressSeries['direction'];
  eventKey: string;
}) {
  const { colors, spacing, typography } = useTheme();
  const [width, setWidth] = useState(0);
  const heights = perfHeights(points, direction);
  const best = bestIndex(points, direction);
  const lastIdx = points.length - 1;
  const single = points.length === 1;
  const DOT = 9;
  const TH = 2.5;

  const yOf = (i: number) => CHART_HEIGHT - heights[i] * CHART_HEIGHT;
  // Coordonnées pixel (segments) — disponibles une fois la largeur connue.
  const xy = heights.map((_, i) => ({
    x: single ? width / 2 : (i / (lastIdx || 1)) * width,
    y: yOf(i),
  }));

  const axisStyle = {
    color: colors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.caption.fontSize,
  } as const;

  return (
    <View style={{ gap: spacing[2] }}>
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: CHART_HEIGHT, position: 'relative' }}
      >
        {/* Lignes de grille horizontales. */}
        {[0.25, 0.5, 0.75].map((g) => (
          <View
            key={g}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: CHART_HEIGHT * g,
              height: 1,
              backgroundColor: colors.border,
            }}
          />
        ))}

        {/* Segments reliant les marques (centrés puis tournés ; origine par défaut = centre). */}
        {width > 0
          ? xy.slice(1).map((p1, i) => {
              const p0 = xy[i];
              const dx = p1.x - p0.x;
              const dy = p1.y - p0.y;
              const len = Math.hypot(dx, dy);
              const angle = Math.atan2(dy, dx);
              return (
                <View
                  key={`seg-${i}`}
                  style={{
                    position: 'absolute',
                    left: (p0.x + p1.x) / 2 - len / 2,
                    top: (p0.y + p1.y) / 2 - TH / 2,
                    width: len,
                    height: TH,
                    borderRadius: TH,
                    backgroundColor: colors.accent,
                    transform: [{ rotateZ: `${angle}rad` }],
                  }}
                />
              );
            })
          : null}

        {/* Points (positionnés en %) : best surligné d'un anneau, final plein, autres en aplat doux. */}
        {heights.map((_, i) => {
          const isBest = i === best;
          const isLast = i === lastIdx;
          const size = isBest ? DOT + 4 : isLast ? DOT + 2 : DOT;
          const pct = single ? 50 : (i / (lastIdx || 1)) * 100;
          return (
            <View
              key={`${points[i].date}-${i}`}
              testID={`progress-point-${eventKey}-${i}`}
              style={{
                position: 'absolute',
                left: `${pct}%`,
                marginLeft: -size / 2,
                top: yOf(i) - size / 2,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: isBest || isLast ? colors.accent : colors.accentSubtle,
                borderWidth: isBest ? 2 : 0,
                borderColor: colors.surface,
              }}
            />
          );
        })}
      </View>

      {/* Axe : dates début → fin de la période. */}
      {!single ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={axisStyle}>{shortDate(points[0].date)}</Text>
          <Text style={axisStyle}>{shortDate(points[lastIdx].date)}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Ligne record : épreuve + **PB** mis en avant + date (+ badge « manuel »). Si le `seasonBest`
 * de l'épreuve (même `eventKey`, dérivé de la progression — ADR-34) est fourni, une ligne
 * **« SB <année> »** s'affiche sous le PB (le PB reste porté par `personal_records`).
 */
export function RecordRow({
  record,
  seasonBest,
}: {
  record: PersonalRecord;
  seasonBest?: ProgressPoint;
}) {
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
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
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
          {seasonBest ? (
            <Text
              testID={`record-${record.eventKey}-sb`}
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.caption.fontSize,
              }}
            >
              {`SB ${seasonBest.date.slice(0, 4)} · ${formatRecordValue(seasonBest.value, record.unit)}`}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
