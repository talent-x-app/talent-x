import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card, SegmentedTabs } from '../components/ui';
import {
  buildMonthGrid,
  buildWeek,
  dayKeyOf,
  formatDayLabel,
  formatMonthLabel,
  formatWeekRange,
  WEEKDAY_LABELS,
  type DayCell,
} from './calendar-grid';
import {
  type CalendarEntry,
  type CalendarTone,
  groupEntriesByDay,
  undatedEntries,
} from './calendar-model';

/**
 * Vue calendrier partagée coach (C-09) — bascule **Mois ⇄ Semaine** (ADR-47, harmonisée avec le
 * calendrier athlète `SessionsCalendar`). Purement présentielle : le parent fournit les entrées
 * dérivées (`CalendarEntry[]` : séances + compétitions, datées via `scheduledDate` ou l'échéance
 * d'affectation — TLX-195) et le résolveur de tap. Grille calendaire avec pastilles de tonalité,
 * sélection d'un jour → ses entrées, plus une section « Sans date » pour les entrées non planifiées.
 */
export function CalendarView({
  entries,
  now,
  onPressEntry,
  testIDPrefix,
}: {
  entries: CalendarEntry[];
  now: Date;
  onPressEntry: (entry: CalendarEntry) => void;
  testIDPrefix: string;
}) {
  const { colors, typography, spacing, borderWidth } = useTheme();
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(now);
  const [selectedKey, setSelectedKey] = useState(dayKeyOf(now));

  const byDay = groupEntriesByDay(entries);
  const undated = undatedEntries(entries);
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
  const dayEntries = byDay.get(selectedKey) ?? [];

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
                testIDPrefix={testIDPrefix}
                cell={cell}
                dots={dayToneColors(byDay.get(cell.key) ?? [], colors)}
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
              dots={dayToneColors(byDay.get(cell.key) ?? [], colors)}
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

      {/* Entrées du jour sélectionné. */}
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
          {dayEntries.length === 0
            ? 'aucune séance'
            : `${dayEntries.length} séance${dayEntries.length > 1 ? 's' : ''}`}
        </Text>
        {dayEntries.length === 0 ? (
          <Card testID={`${testIDPrefix}-day-empty`}>
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
          dayEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onPress={() => onPressEntry(entry)}
              testID={`${testIDPrefix}-entry-${entry.id}`}
            />
          ))
        )}
      </View>

      {/* Entrées sans date planifiée (échéance non posée), présentées à part. */}
      {undated.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Sans date
          </Text>
          {undated.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onPress={() => onPressEntry(entry)}
              testID={`${testIDPrefix}-undated-${entry.id}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Pastilles de tonalité distinctes (max 3) des entrées d'un jour. */
function dayToneColors(
  entries: CalendarEntry[],
  colors: ReturnType<typeof useTheme>['colors'],
): string[] {
  const seen = new Set<CalendarTone>();
  const out: string[] = [];
  for (const e of entries) {
    if (seen.has(e.tone)) continue;
    seen.add(e.tone);
    out.push(toneColor(e.tone, colors));
    if (out.length === 3) break;
  }
  return out;
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
  dots: string[];
  selected: boolean;
  today: boolean;
  onPress: () => void;
  testIDPrefix: string;
}) {
  const { colors, typography, radius, borderWidth } = useTheme();
  const hasEntries = dots.length > 0;
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
        backgroundColor: selected ? colors.accent : hasEntries ? colors.surface : 'transparent',
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
        {dots.map((color, i) => (
          <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        ))}
      </View>
    </Pressable>
  );
}

/** Carte d'une entrée : pastille colorée (statut) + titre + libellé de statut + chevron. */
function EntryCard({
  entry,
  onPress,
  testID,
}: {
  entry: CalendarEntry;
  onPress: () => void;
  testID: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const dotColor = toneColor(entry.tone, colors);
  return (
    <Card testID={testID} onPress={onPress} style={{ paddingVertical: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 8, height: 8, borderRadius: 99, backgroundColor: dotColor }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {entry.title}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.caption.fontSize,
            }}
          >
            {entry.statusLabel}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

/** Couleur de pastille (token) par tonalité d'entrée. */
function toneColor(tone: CalendarTone, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (tone) {
    case 'success':
      return colors.success;
    case 'warning':
      return colors.warning;
    case 'danger':
      return colors.danger;
    case 'accent':
      return colors.accent;
    case 'neutral':
    default:
      return colors.textMuted;
  }
}
