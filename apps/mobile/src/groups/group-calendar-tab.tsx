import { type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, SegmentedTabs } from '../components/ui';
import { SearchField } from '../components/SearchField';
import { filterByText } from '../search/text-filter';
import { sessionTitle } from '../athlete/athlete-session-ui';
import { SectionTitle } from '../sessions/session-content-ui';
import { sessionDiscipline } from '../progress/session-discipline';
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
} from './group-feed';
import { disciplineVisual, type DisciplineVisual } from './discipline-ui';
import { DisciplineDot, GroupSessionRow } from './group-session-ui';
import { FeedError, FeedSkeleton } from './group-states-ui';

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
 * Onglet **Calendrier** du hub de groupe (ADR-43 §4, maquette `group-calendar`) : bascule
 * Mois / Semaine, recherche par titre (client) qui **remplace** la grille par une liste de
 * résultats, sélection d'un jour → ses séances (ligne compacte réutilisée). Pastilles de discipline
 * **dérivées** (ADR-43 §2). Filtres discipline côté serveur = Phase B / Lot 2.
 */
export function GroupCalendarTab({
  assignments,
  isLoading,
  isError,
  onRetry,
  onOpen,
  now,
}: {
  assignments?: Assignment[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (assignment: Assignment) => void;
  now: Date;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState(now);
  const [selectedKey, setSelectedKey] = useState(dayKeyOf(now));

  if (isLoading) return <FeedSkeleton testID="group-calendar-loading" />;
  if (isError) {
    return (
      <FeedError
        testID="group-calendar-error"
        message="Impossible de charger le calendrier."
        onRetry={onRetry}
      />
    );
  }

  const list = assignments ?? [];
  const byDay = groupByDay(list);
  const todayKey = dayKeyOf(now);
  const trimmed = search.trim();

  // Recherche active → la grille laisse place à une liste de résultats triée par date décroissante.
  if (trimmed !== '') {
    const results = filterByText(list, search, sessionTitle).sort((a, b) =>
      (b.dueDate ?? b.session?.scheduledDate ?? '').localeCompare(
        a.dueDate ?? a.session?.scheduledDate ?? '',
      ),
    );
    return (
      <View style={{ gap: spacing[4] }}>
        <SearchField
          testID="group-calendar-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher une séance"
        />
        {results.length === 0 ? (
          <Card testID="group-calendar-no-match">
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Aucune séance ne correspond à « {trimmed} ».
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing[3] }}>
            <SectionTitle testID="group-calendar-results-title">
              {results.length} résultat{results.length > 1 ? 's' : ''}
            </SectionTitle>
            {results.map((a) => (
              <GroupSessionRow key={a.id} assignment={a} onPress={() => onOpen(a)} />
            ))}
          </View>
        )}
      </View>
    );
  }

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
        testID="group-calendar-mode"
        items={[
          { key: 'month', label: 'Mois' },
          { key: 'week', label: 'Semaine' },
        ]}
        activeKey={mode}
        onChange={(k) => setMode(k as 'month' | 'week')}
      />

      <SearchField
        testID="group-calendar-search"
        value={search}
        onChangeText={setSearch}
        placeholder="Rechercher une séance"
      />

      {/* Navigation de période. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Text
          testID="group-calendar-period"
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.body.fontSize,
          }}
        >
          {periodLabel}
        </Text>
        <Pressable
          testID="group-calendar-today"
          onPress={goToday}
          accessibilityRole="button"
          accessibilityLabel="Aujourd'hui"
          style={{
            paddingHorizontal: spacing[3],
            paddingVertical: spacing[1],
            borderRadius: radius.pill,
            backgroundColor: colors.accentSubtle,
            minHeight: 36,
            justifyContent: 'center',
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
        <CalNavButton icon="chevron-left" label="Période précédente" onPress={goPrev} />
        <CalNavButton icon="chevron-right" label="Période suivante" onPress={goNext} />
      </View>

      {/* En-têtes de jours. */}
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_LABELS.map((d, i) => (
          <Text
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              color: colors.textMuted,
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
              cell={cell}
              dots={dayDots(byDay.get(cell.key) ?? [])}
              selected={cell.key === selectedKey}
              today={cell.key === todayKey}
              onPress={() => setSelectedKey(cell.key)}
            />
          ))}
        </View>
      )}

      {/* Séances du jour sélectionné. */}
      <View
        style={{
          height: borderWidth.hairline,
          backgroundColor: colors.border,
          marginVertical: spacing[1],
        }}
      />
      <View style={{ gap: spacing[3] }}>
        <SectionTitle testID="group-calendar-day-title">
          {formatDayLabel(selectedDate)} ·{' '}
          {daySessions.length === 0
            ? 'aucune séance'
            : `${daySessions.length} séance${daySessions.length > 1 ? 's' : ''}`}
        </SectionTitle>
        {daySessions.length === 0 ? (
          <Card testID="group-calendar-day-empty">
            <Text
              style={{
                color: colors.textMuted,
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
            <GroupSessionRow key={a.id} assignment={a} onPress={() => onOpen(a)} />
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
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors, radius, borderWidth } = useTheme();
  return (
    <Pressable
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
}: {
  cell: DayCell;
  dots: DisciplineVisual[];
  selected: boolean;
  today: boolean;
  onPress: () => void;
}) {
  const { colors, typography, radius, borderWidth } = useTheme();
  const hasSessions = dots.length > 0;
  return (
    <Pressable
      testID={`group-calendar-cell-${cell.key}`}
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
          <DisciplineDot key={v.key} visual={v} testID={`group-calendar-cell-${cell.key}-pip`} />
        ))}
      </View>
    </Pressable>
  );
}
