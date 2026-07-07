import { type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, SegmentedTabs } from '../components/ui';
import { AssignmentListItem } from '../athlete/athlete-session-ui';
import { sessionDiscipline } from '../progress/session-discipline';
import { disciplineVisual, type DisciplineVisual } from '../groups/discipline-ui';
import {
  buildMonthGrid,
  buildWeek,
  dayKeyOf,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRange,
  groupByDay,
  WEEKDAY_LABELS,
  type DayCell,
} from './calendar-grid';

/** Pastilles distinctes (max 3) des disciplines des séances d'un jour. */
function dayDots(assignments: Assignment[]): DisciplineVisual[] {
  const seen = new Set<string>();
  const out: DisciplineVisual[] = [];
  for (const a of assignments) {
    const v = disciplineVisual(sessionDiscipline(a.session?.exercises?.items));
    if (v && !seen.has(v.key)) {
      seen.add(v.key);
      out.push(v);
      if (out.length === 3) break;
    }
  }
  return out;
}

/**
 * Calendrier de séances réutilisable (ADR-47) : bascule **Mois ⇄ Semaine**, grille calendaire avec
 * pastilles de discipline dérivées (ADR-43 §2), sélection d'un jour → ses séances (ligne `AssignmentListItem`).
 * Présentationnel : les affectations à afficher sont fournies par l'appelant (toutes les séances de
 * l'athlète côté onglet Séances ; uniquement celles du coach côté hub de groupe).
 */
export function SessionsCalendar({
  assignments,
  onOpen,
  now = new Date(),
  testIDPrefix = 'cal',
}: {
  assignments: Assignment[];
  onOpen: (assignment: Assignment) => void;
  now?: Date;
  testIDPrefix?: string;
}) {
  const { colors, typography, spacing, borderWidth } = useTheme();
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(now);
  const [selectedKey, setSelectedKey] = useState(dayKeyOf(now));

  const byDay = groupByDay(assignments);
  const todayKey = dayKeyOf(now);

  const weeks = mode === 'month' ? buildMonthGrid(cursor.getFullYear(), cursor.getMonth()) : null;
  const week = mode === 'week' ? buildWeek(cursor) : null;
  const periodLabel =
    mode === 'month'
      ? formatMonthLabel(cursor.getFullYear(), cursor.getMonth())
      : formatWeekRange(week ?? []);

  const goPrev = () =>
    setCursor((c) =>
      mode === 'month'
        ? new Date(c.getFullYear(), c.getMonth() - 1, 1)
        : new Date(c.getFullYear(), c.getMonth(), c.getDate() - 7),
    );
  const goNext = () =>
    setCursor((c) =>
      mode === 'month'
        ? new Date(c.getFullYear(), c.getMonth() + 1, 1)
        : new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7),
    );
  const goToday = () => {
    setCursor(now);
    setSelectedKey(todayKey);
  };

  const selectedDate = new Date(`${selectedKey}T00:00:00`);
  const daySessions = byDay.get(selectedKey) ?? [];

  return (
    <View style={{ gap: spacing[4] }}>
      <SegmentedTabs
        testID={`${testIDPrefix}-mode`}
        items={[
          { key: 'month', label: 'Mois' },
          { key: 'week', label: 'Semaine' },
        ]}
        activeKey={mode}
        onChange={(k) => setMode(k as 'month' | 'week')}
      />

      {/* Navigation de période. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text
          testID={`${testIDPrefix}-period`}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.body.fontSize,
          }}
        >
          {periodLabel}
        </Text>
        <CalNavButton
          testIDPrefix={testIDPrefix}
          icon="chevron-left"
          label="Période précédente"
          onPress={goPrev}
        />
        <Pressable
          testID={`${testIDPrefix}-today`}
          onPress={goToday}
          accessibilityRole="button"
          accessibilityLabel="Aujourd'hui"
          style={{
            paddingHorizontal: spacing[3],
            minHeight: 36,
            justifyContent: 'center',
            borderRadius: 999,
            backgroundColor: colors.accentSubtle,
          }}
        >
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.caption.fontSize,
            }}
          >
            Aujourd'hui
          </Text>
        </Pressable>
        <CalNavButton
          testIDPrefix={testIDPrefix}
          icon="chevron-right"
          label="Période suivante"
          onPress={goNext}
        />
      </View>

      {/* En-têtes de jours. */}
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.caption.fontSize,
            }}
          >
            {d}
          </Text>
        ))}
      </View>

      {/* Grille (mois) ou bande (semaine). */}
      {mode === 'month' ? (
        weeks?.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: spacing[1] }}>
            {row.map((cell) => (
              <CalendarCell
                key={cell.key}
                testIDPrefix={testIDPrefix}
                cell={cell}
                dots={dayDots(byDay.get(cell.key) ?? [])}
                selected={cell.key === selectedKey}
                today={cell.key === todayKey}
                onPress={() => setSelectedKey(cell.key)}
              />
            ))}
          </View>
        ))
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing[1] }}>
          {week?.map((cell) => (
            <CalendarCell
              key={cell.key}
              testIDPrefix={testIDPrefix}
              cell={cell}
              dots={dayDots(byDay.get(cell.key) ?? [])}
              selected={cell.key === selectedKey}
              today={cell.key === todayKey}
              onPress={() => setSelectedKey(cell.key)}
            />
          ))}
        </View>
      )}

      <View
        style={{
          height: borderWidth.hairline,
          backgroundColor: colors.border,
          marginVertical: spacing[1],
        }}
      />

      {/* Séances du jour sélectionné. */}
      <View style={{ gap: spacing[3] }}>
        <Text
          testID={`${testIDPrefix}-day-title`}
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          {formatDayLabel(selectedDate)} ·{' '}
          {daySessions.length === 0
            ? 'aucune séance'
            : `${daySessions.length} séance${daySessions.length > 1 ? 's' : ''}`}
        </Text>
        {daySessions.length === 0 ? (
          <Card testID={`${testIDPrefix}-day-empty`}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Rien de prévu ce jour-là.
            </Text>
          </Card>
        ) : (
          daySessions.map((a) => (
            <AssignmentListItem key={a.id} assignment={a} onPress={() => onOpen(a)} />
          ))
        )}
      </View>
    </View>
  );
}

function CalNavButton({
  icon,
  label,
  onPress,
  testIDPrefix,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  testIDPrefix: string;
}) {
  const { colors, radius, borderWidth } = useTheme();
  return (
    <Pressable
      testID={`${testIDPrefix}-nav-${icon === 'chevron-left' ? 'prev' : 'next'}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.sm,
        borderWidth: borderWidth.hairline,
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather name={icon} size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

function CalendarCell({
  cell,
  dots,
  selected,
  today,
  onPress,
  testIDPrefix,
}: {
  cell: DayCell;
  dots: DisciplineVisual[];
  selected: boolean;
  today: boolean;
  onPress: () => void;
  testIDPrefix: string;
}) {
  const { colors, typography, radius, borderWidth } = useTheme();
  const hasSessions = dots.length > 0;
  return (
    <Pressable
      testID={`${testIDPrefix}-cell-${cell.key}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cell.day}`}
      accessibilityState={{ selected }}
      style={{
        flex: 1,
        aspectRatio: 1,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        opacity: cell.inMonth ? 1 : 0.35,
        backgroundColor: selected ? colors.accent : hasSessions ? colors.surface : 'transparent',
        borderWidth: today && !selected ? borderWidth.thick : 0,
        borderColor: colors.accentText,
      }}
    >
      <Text
        style={{
          color: selected ? colors.textOnAccent : colors.textPrimary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {cell.day}
      </Text>
      <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>
        {dots.map((v) => (
          <View
            key={v.key}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors[v.colorKey] as string,
            }}
          />
        ))}
      </View>
    </Pressable>
  );
}
