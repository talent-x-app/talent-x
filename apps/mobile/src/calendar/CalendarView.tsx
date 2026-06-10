import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Card } from '../components/ui';
import {
  type CalendarEntry,
  type CalendarTone,
  formatDayLabel,
  formatWeekLabel,
  isSameDay,
  startOfWeek,
  undatedEntries,
  weekView,
} from './calendar-model';

/**
 * Vue calendrier hebdomadaire partagée (TLX-100 — A-08 / C-09). Purement présentielle : le
 * parent fournit les entrées dérivées et le résolveur de tap ; le composant gère la navigation
 * de semaine (état local) et l'affichage jour par jour (« Repos » si vide), plus une section
 * « Sans date » pour les entrées non planifiées. Aucune dépendance réseau.
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
  const { colors, typography, spacing } = useTheme();
  const currentWeek = startOfWeek(now);
  const [weekStart, setWeekStart] = useState(currentWeek);

  const days = weekView(entries, weekStart);
  const undated = undatedEntries(entries);
  const isCurrentWeek = isSameDay(weekStart, currentWeek);

  return (
    <View style={{ gap: spacing[4] }}>
      {/* Navigation de semaine : ‹ Semaine du X › + retour à la semaine courante. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Pressable
          testID={`${testIDPrefix}-week-prev`}
          accessibilityLabel="Semaine précédente"
          onPress={() => setWeekStart((w) => shiftWeek(w, -7))}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text
          testID={`${testIDPrefix}-week-label`}
          style={{
            flex: 1,
            textAlign: 'center',
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          {formatWeekLabel(weekStart)}
        </Text>
        <Pressable
          testID={`${testIDPrefix}-week-next`}
          accessibilityLabel="Semaine suivante"
          onPress={() => setWeekStart((w) => shiftWeek(w, 7))}
          hitSlop={8}
        >
          <Feather name="chevron-right" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {!isCurrentWeek ? (
        <Pressable
          testID={`${testIDPrefix}-today`}
          onPress={() => setWeekStart(currentWeek)}
          style={{ alignSelf: 'center' }}
        >
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Revenir à aujourd'hui
          </Text>
        </Pressable>
      ) : null}

      {/* Grille : un bloc par jour (lundi → dimanche). */}
      <View style={{ gap: spacing[2] }}>
        {days.map((day) => {
          const today = isSameDay(day.date, now);
          return (
            <View
              key={day.key}
              testID={`${testIDPrefix}-day-${day.key}`}
              style={{ flexDirection: 'row', gap: spacing[3] }}
            >
              <Text
                style={{
                  width: 64,
                  paddingTop: spacing[3],
                  color: today ? colors.accentText : colors.textMuted,
                  fontFamily: today ? typography.fontFamily.bold : typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                  textTransform: 'capitalize',
                }}
              >
                {formatDayLabel(day.date)}
              </Text>
              <View style={{ flex: 1, gap: spacing[2] }}>
                {day.entries.length === 0 ? (
                  <Text
                    style={{
                      paddingVertical: spacing[3],
                      color: colors.textMuted,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    Repos
                  </Text>
                ) : (
                  day.entries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onPress={() => onPressEntry(entry)}
                      testID={`${testIDPrefix}-entry-${entry.id}`}
                    />
                  ))
                )}
              </View>
            </View>
          );
        })}
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

/** Décale un début de semaine de `n` jours en restant aligné minuit UTC. */
function shiftWeek(weekStart: Date, n: number): Date {
  const d = new Date(weekStart.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
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
