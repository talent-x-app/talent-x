import {
  type PersonalRecord,
  type Progress,
  type ProgressPoint,
  type ProgressSeries,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { Card, Chip } from '../components/ui';
import { formatSessionDate } from './athlete-session-ui';
import { formatRecordValue } from './perf-entry';
import {
  PROGRESS_WINDOWS,
  bestIndex,
  perfHeights,
  pointsInWindow,
  seriesTrend,
  timeFractions,
  windowDelta,
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

const CHART_HEIGHT = 132;
const CHART_PAD_Y = 16; // marge haut/bas pour les points extrêmes + la ligne PB.
const CHART_PAD_X = 10; // marge gauche/droite pour ne pas rogner les pastilles aux bords.

/** Date compacte « JJ/MM » à partir d'une clé `YYYY-MM-DD` (axe de la courbe). */
function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Delta lisible (ampleur seule) — jamais de `mm:ss` (un delta reste petit). ADR-56. */
function formatDelta(magnitude: number, unit: 's' | 'm'): string {
  return `${magnitude} ${unit}`;
}

/**
 * Couleur de **discipline** (ADR-56) — dérivée de la famille de l'`eventKey`. Sert à la **pastille
 * d'en-tête** et à la **ligne PB** pour distinguer les disciplines quand on scrolle plusieurs
 * cartes ; les courbes/points restent en `accent` (identité mono-accent du design system).
 */
function disciplineColor(eventKey: string, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (eventKey.split(':')[0]) {
    case 'hurdles':
      return colors.info;
    case 'endurance':
    case 'interval':
      return colors.success;
    case 'jumps':
    case 'vertical':
      return colors.warning;
    case 'throws':
      return colors.danger;
    default:
      return colors.accent; // sprint + repli
  }
}

/** Libellés de discipline (regroupe interval→Demi-fond, vertical→Sauts). */
const DISCIPLINE_LABELS: Record<string, string> = {
  sprint: 'Sprint',
  hurdles: 'Haies',
  endurance: 'Demi-fond',
  jumps: 'Sauts',
  throws: 'Lancers',
};

/** Clé de discipline d'une épreuve (regroupe interval→endurance, vertical→jumps). */
function disciplineKeyOf(eventKey: string): string {
  const family = eventKey.split(':')[0];
  if (family === 'interval') return 'endurance';
  if (family === 'vertical') return 'jumps';
  return family;
}

/**
 * Explorateur de progression (ADR-56) — au lieu d'empiler tous les graphes, navigation à **deux
 * niveaux** : **discipline** (onglets) puis **épreuve** (pills), avec un graphe en **focus**.
 * « Toutes » retombe sur la liste. La fenêtre temporelle (Semaine/Mois/Année) est intégrée.
 * Partagé athlète (A-06) et coach (C-03). Défaut : l'épreuve **la plus récente** (focus direct).
 */
export function ProgressExplorer({
  series,
  window,
  onWindow,
}: {
  series: ProgressSeries[];
  window: ProgressWindow;
  onWindow: (w: ProgressWindow) => void;
}) {
  const { spacing } = useTheme();
  const disciplines = [...new Set(series.map((s) => disciplineKeyOf(s.eventKey)))];
  const lastDateOf = (s: ProgressSeries) => s.points[s.points.length - 1]?.date ?? '';
  const mostRecent = [...series].sort((a, b) => lastDateOf(b).localeCompare(lastDateOf(a)))[0];

  const [discipline, setDiscipline] = useState<string>(
    mostRecent ? disciplineKeyOf(mostRecent.eventKey) : 'all',
  );
  const [event, setEvent] = useState<string>(mostRecent ? mostRecent.eventKey : 'all');

  const inDiscipline =
    discipline === 'all'
      ? series
      : series.filter((s) => disciplineKeyOf(s.eventKey) === discipline);
  const shown =
    discipline !== 'all' && event !== 'all'
      ? inDiscipline.filter((s) => s.eventKey === event)
      : inDiscipline;

  const selectDiscipline = (key: string) => {
    setDiscipline(key);
    setEvent('all'); // repart sur la vue d'ensemble de la discipline
  };

  return (
    <View style={{ gap: spacing[3] }}>
      <ProgressWindowChips window={window} onChange={onWindow} />

      {/* Onglets discipline (pastille couleur + libellé). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing[2] }}
      >
        <Chip
          testID="progress-discipline-all"
          selected={discipline === 'all'}
          onPress={() => setDiscipline('all')}
        >
          Toutes
        </Chip>
        {disciplines.map((d) => (
          <Chip
            key={d}
            testID={`progress-discipline-tab-${d}`}
            selected={discipline === d}
            onPress={() => selectDiscipline(d)}
          >
            {DISCIPLINE_LABELS[d] ?? d}
          </Chip>
        ))}
      </ScrollView>

      {/* Pills d'épreuve (si une discipline est choisie et a plusieurs épreuves). */}
      {discipline !== 'all' && inDiscipline.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing[2] }}
        >
          <Chip
            testID="progress-event-all"
            selected={event === 'all'}
            onPress={() => setEvent('all')}
          >
            Toutes
          </Chip>
          {inDiscipline.map((s) => (
            <Chip
              key={s.eventKey}
              testID={`progress-event-${s.eventKey}`}
              selected={event === s.eventKey}
              onPress={() => setEvent(s.eventKey)}
            >
              {s.label}
            </Chip>
          ))}
        </ScrollView>
      ) : null}

      {shown.map((s) => (
        <ProgressSeriesCard key={s.eventKey} series={s} window={window} />
      ))}
    </View>
  );
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
  const delta = windowDelta(points, series.direction);

  return (
    <Card testID={`progress-series-${series.eventKey}`}>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          {/* Pastille de discipline (ADR-56) — repère couleur quand plusieurs cartes. */}
          <View
            testID={`progress-discipline-${series.eventKey}`}
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: disciplineColor(series.eventKey, colors),
            }}
          />
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

        {/* Bandeau progression (ADR-56) : delta net de la fenêtre, coloré par le sens. */}
        {delta && delta.changed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <View
              testID={`progress-delta-${series.eventKey}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[1],
                paddingHorizontal: spacing[2],
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: delta.improved ? colors.successBg : colors.surfaceSunken,
              }}
            >
              <Feather
                name={delta.improved ? 'arrow-up-right' : 'arrow-down-right'}
                size={13}
                color={delta.improved ? colors.success : colors.textMuted}
              />
              <Text
                style={{
                  color: delta.improved ? colors.success : colors.textSecondary,
                  fontFamily: typography.fontFamily.semibold,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {formatDelta(delta.magnitude, series.unit)}
              </Text>
            </View>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.caption.fontSize,
              }}
            >
              depuis le {shortDate(delta.fromDate)}
            </Text>
          </View>
        ) : null}

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
          <ProgressTimeline
            points={points}
            direction={series.direction}
            unit={series.unit}
            eventKey={series.eventKey}
            pbColor={disciplineColor(series.eventKey, colors)}
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

/** Bornage. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Frise de progression (ADR-56) — courbe SVG riche + **bandeau de marques**, pensée pour être
 * **lisible** : chaque marque est sélectionnable (tap natif / clic web) → **tooltip** date·valeur·Δ,
 * ligne-guide ; le bandeau liste toutes les perfs (le « journal »). Orientée performance,
 * unité/sens-aware → toutes disciplines (temps `s`/`mm:ss` min, distance `m` max).
 *
 * Les colonnes de sélection et le bandeau sont rendus **sans mesure de largeur** (donc testables) ;
 * seul le tracé SVG attend la largeur mesurée via `onLayout`.
 */
function ProgressTimeline({
  points,
  direction,
  unit,
  eventKey,
  pbColor,
}: {
  points: ProgressPoint[];
  direction: ProgressSeries['direction'];
  unit: 's' | 'm';
  eventKey: string;
  pbColor: string;
}) {
  const { colors, spacing, typography } = useTheme();
  const [width, setWidth] = useState(0);
  const lastIdx = points.length - 1;
  const [selected, setSelected] = useState(lastIdx);
  const sel = clamp(selected, 0, lastIdx); // borne si la fenêtre rétrécit
  const heights = perfHeights(points, direction);
  const best = bestIndex(points, direction);
  const single = points.length === 1;
  const fracs = timeFractions(points); // X proportionnel au temps (ADR-56)

  const xOf = (i: number) => CHART_PAD_X + fracs[i] * (width - 2 * CHART_PAD_X);
  // Largeurs des zones de tap, **proportionnelles au temps** (alignées sur l'espacement des points).
  const hitWeights = fracs.map((f, i) => {
    const left = i === 0 ? 0 : (fracs[i - 1] + f) / 2;
    const right = i === lastIdx ? 1 : (f + fracs[i + 1]) / 2;
    return Math.max(0.0001, right - left);
  });
  const selPoint = points[sel];
  const prevDelta =
    sel > 0 ? Math.round(Math.abs(points[sel].value - points[sel - 1].value) * 100) / 100 : 0;
  const selImproved =
    sel > 0 &&
    (direction === 'min'
      ? points[sel].value < points[sel - 1].value
      : points[sel].value > points[sel - 1].value);

  const axisStyle = {
    color: colors.textMuted,
    fontFamily: typography.fontFamily.regular,
    fontSize: typography.caption.fontSize,
  } as const;

  return (
    <View style={{ gap: spacing[2] }}>
      {/* Zone graphe : tracé SVG (mesuré) + tooltip + colonnes de sélection (toujours rendues). */}
      <View
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: CHART_HEIGHT, position: 'relative' }}
      >
        {width > 0 ? (
          <ProgressChart
            width={width}
            heights={heights}
            fracs={fracs}
            best={best}
            selected={sel}
            pbColor={pbColor}
          />
        ) : null}

        {/* Tooltip du point sélectionné (date · valeur · Δ vs précédente). */}
        {width > 0 && selPoint ? (
          <View
            testID={`progress-tooltip-${eventKey}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: clamp(xOf(sel) - 56, 0, Math.max(0, width - 112)),
              width: 112,
              alignItems: 'center',
              gap: 1,
              paddingVertical: 4,
              paddingHorizontal: spacing[2],
              borderRadius: 10,
              backgroundColor: colors.surfaceSunken,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {formatRecordValue(selPoint.value, unit)}
            </Text>
            <Text style={axisStyle}>
              {shortDate(selPoint.date)}
              {prevDelta > 0 ? ` · ${selImproved ? '▲' : '▼'} ${formatDelta(prevDelta, unit)}` : ''}
            </Text>
          </View>
        ) : null}

        {/* Colonnes de sélection transparentes (1 par marque) — natif + web, testables sans mesure. */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: 'row',
          }}
        >
          {points.map((p, i) => (
            <Pressable
              key={`hit-${p.date}-${i}`}
              testID={`progress-point-${eventKey}-${i}`}
              accessibilityRole="button"
              accessibilityLabel={`${shortDate(p.date)} ${formatRecordValue(p.value, unit)}`}
              onPress={() => setSelected(i)}
              style={{ flex: hitWeights[i] }}
            />
          ))}
        </View>
      </View>

      {/* Axe dates début → fin. */}
      {!single ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={axisStyle}>{shortDate(points[0].date)}</Text>
          <Text style={axisStyle}>{shortDate(points[lastIdx].date)}</Text>
        </View>
      ) : null}

      {/* Bandeau de marques (le journal lisible) — puce date·valeur·Δ, tap synchronisé au point. */}
      {!single ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing[2], paddingVertical: 2 }}
        >
          {points.map((p, i) => {
            const isSel = i === sel;
            const isBest = i === best;
            const up =
              i > 0 &&
              (direction === 'min' ? p.value < points[i - 1].value : p.value > points[i - 1].value);
            const down =
              i > 0 &&
              (direction === 'min' ? p.value > points[i - 1].value : p.value < points[i - 1].value);
            return (
              <Pressable
                key={`mark-${p.date}-${i}`}
                testID={`progress-mark-${eventKey}-${i}`}
                onPress={() => setSelected(i)}
                style={{
                  paddingHorizontal: spacing[2],
                  paddingVertical: spacing[1],
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: isSel ? colors.accent : colors.border,
                  backgroundColor: isSel ? colors.accentSubtle : colors.surface,
                  alignItems: 'center',
                  minWidth: 64,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.semibold,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    {formatRecordValue(p.value, unit)}
                  </Text>
                  {up ? <Feather name="arrow-up-right" size={11} color={colors.success} /> : null}
                  {down ? (
                    <Feather name="arrow-down-right" size={11} color={colors.textMuted} />
                  ) : null}
                  {isBest ? <Feather name="award" size={11} color={colors.accentText} /> : null}
                </View>
                <Text style={axisStyle}>{shortDate(p.date)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * Rendu SVG de la courbe (ADR-56) — aire dégradée + ligne **lissée** (Catmull-Rom → Bézier) +
 * grille + **ligne PB** pointillée + **ligne-guide** du point sélectionné + pastilles. Pur
 * présentationnel : reçoit les hauteurs normalisées (0..1, déjà orientées performance) + la largeur.
 */
function ProgressChart({
  width,
  heights,
  fracs,
  best,
  selected,
  pbColor,
}: {
  width: number;
  heights: number[];
  fracs: number[];
  best: number;
  selected: number;
  pbColor: string;
}) {
  const { colors } = useTheme();
  const innerH = CHART_HEIGHT - CHART_PAD_Y * 2;
  const n = heights.length;
  const xOf = (i: number) => CHART_PAD_X + fracs[i] * (width - 2 * CHART_PAD_X);
  const yOf = (i: number) => CHART_PAD_Y + (1 - heights[i]) * innerH;
  const pts = heights.map((_, i) => ({ x: xOf(i), y: yOf(i) }));

  const linePath = smoothPath(pts);
  const areaPath =
    pts.length > 1
      ? `${linePath} L ${pts[n - 1].x} ${CHART_HEIGHT} L ${pts[0].x} ${CHART_HEIGHT} Z`
      : '';

  return (
    <Svg width={width} height={CHART_HEIGHT}>
      <Defs>
        <LinearGradient id="progressArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.accent} stopOpacity={0.22} />
          <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {[0.25, 0.5, 0.75].map((g) => (
        <Line
          key={g}
          x1={0}
          y1={CHART_HEIGHT * g}
          x2={width}
          y2={CHART_HEIGHT * g}
          stroke={colors.border}
          strokeWidth={1}
        />
      ))}

      {areaPath ? <Path d={areaPath} fill="url(#progressArea)" /> : null}
      {pts.length > 1 ? (
        <Path
          d={linePath}
          fill="none"
          stroke={colors.accent}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Ligne PB (meilleure marque) — couleur de discipline. */}
      {pts[best] ? (
        <Line
          x1={0}
          y1={pts[best].y}
          x2={width}
          y2={pts[best].y}
          stroke={pbColor}
          strokeWidth={1}
          strokeDasharray="4 4"
          opacity={0.6}
        />
      ) : null}

      {/* Ligne-guide du point sélectionné. */}
      {pts[selected] ? (
        <Line
          x1={pts[selected].x}
          y1={CHART_PAD_Y}
          x2={pts[selected].x}
          y2={CHART_HEIGHT}
          stroke={colors.accent}
          strokeWidth={1}
          opacity={0.35}
        />
      ) : null}

      {/* Halo de focus autour du point sélectionné. */}
      {pts[selected] ? (
        <Circle
          cx={pts[selected].x}
          cy={pts[selected].y}
          r={9}
          fill="none"
          stroke={colors.accent}
          strokeWidth={1.5}
          opacity={0.3}
        />
      ) : null}

      {/* Pastilles : remplies accent + **halo surface** pour décoller de l'aire/la ligne
          (lisibilité, ADR-56) ; best cerné de la couleur de discipline ; sélection plus grosse. */}
      {pts.map((p, i) => {
        const isBest = i === best;
        const isSel = i === selected;
        return (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isSel ? 6 : isBest ? 5 : 4}
            fill={colors.accent}
            stroke={isBest ? pbColor : colors.surface}
            strokeWidth={isBest ? 2.5 : 2}
          />
        );
      })}
    </Svg>
  );
}

/** Lissage Catmull-Rom → Bézier cubique (ADR-56). 1 point → `M` ; `''` si vide. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
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
