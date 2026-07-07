import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@talent-x/design-tokens';

export interface DatePickerProps {
  /** Date sélectionnée au format `YYYY-MM-DD`, ou `''` si aucune. */
  value: string;
  /** Renvoie la nouvelle date `YYYY-MM-DD`, ou `''` si effacée. */
  onChange: (value: string) => void;
  /** Invite affichée quand aucune date n'est sélectionnée. */
  placeholder?: string;
  /** Permet d'effacer la date (champ optionnel). Défaut `true`. */
  clearable?: boolean;
  testID?: string;
  /** Référence « aujourd'hui » (mois ouvert par défaut + surlignage). Injectable pour les tests. */
  now?: Date;
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;
const pad = (n: number) => String(n).padStart(2, '0');
const isIsoDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Clé `YYYY-MM-DD` (composantes locales). */
function keyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Grille mensuelle (lundi en tête), 6 semaines fixes ; cellules débordantes `inMonth:false`. */
function monthGrid(
  year: number,
  monthIndex: number,
): { key: string; day: number; inMonth: boolean }[][] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7; // lundi = 0
  let d = new Date(year, monthIndex, 1 - startOffset);
  const weeks: { key: string; day: number; inMonth: boolean }[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: { key: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      row.push({ key: keyOf(d), day: d.getDate(), inMonth: d.getMonth() === monthIndex });
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}

/** « juin 2026 ». */
function monthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

/** « 20 juin 2026 » à partir d'une clé `YYYY-MM-DD` (UTC pour ne pas décaler). */
function formatValue(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Sélecteur de date (TLX-197) — calendrier déroulant **cross-platform** (web + natif), sans module
 * natif : déclencheur affichant la date choisie, puis une grille mensuelle (navigation ‹ ›) pour
 * sélectionner un jour. Émet/consomme du `YYYY-MM-DD` (même format que les champs texte remplacés),
 * effaçable. Remplace les saisies libres `AAAA-MM-JJ` (source d'erreurs de date).
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Choisir une date…',
  clearable = true,
  testID,
  now = new Date(),
}: DatePickerProps) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const [open, setOpen] = useState(false);
  const base = isIsoDate(value) ? new Date(`${value}T00:00:00`) : now;
  const [cursor, setCursor] = useState(base);

  const todayKey = keyOf(now);
  const weeks = monthGrid(cursor.getFullYear(), cursor.getMonth());

  const goPrev = () => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const goNext = () => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));

  return (
    <View style={{ gap: spacing[2] }}>
      <Pressable
        testID={testID}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={value ? formatValue(value) : placeholder}
        style={{
          height: 48,
          paddingHorizontal: spacing[4],
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[2],
          borderRadius: radius.sm,
          borderWidth: borderWidth.hairline,
          borderColor: open ? colors.accent : colors.borderStrong,
          backgroundColor: colors.surface,
        }}
      >
        <Feather name="calendar" size={16} color={colors.textMuted} />
        <Text
          style={{
            flex: 1,
            color: value ? colors.textPrimary : colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
          }}
        >
          {value ? formatValue(value) : placeholder}
        </Text>
        {clearable && value ? (
          <Pressable
            testID={testID ? `${testID}-clear` : undefined}
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel="Effacer la date"
            hitSlop={8}
          >
            <Feather name="x" size={16} color={colors.textMuted} />
          </Pressable>
        ) : (
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
        )}
      </Pressable>

      {open ? (
        <View
          style={{
            gap: spacing[2],
            padding: spacing[3],
            borderRadius: radius.sm,
            borderWidth: borderWidth.hairline,
            borderColor: colors.accent,
            backgroundColor: colors.surface,
          }}
        >
          {/* Navigation de mois. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Text
              testID={testID ? `${testID}-period` : undefined}
              style={{
                flex: 1,
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.semibold,
                fontSize: typography.bodySm.fontSize,
                textTransform: 'capitalize',
              }}
            >
              {monthLabel(cursor.getFullYear(), cursor.getMonth())}
            </Text>
            <Pressable
              testID={testID ? `${testID}-prev` : undefined}
              onPress={goPrev}
              accessibilityRole="button"
              accessibilityLabel="Mois précédent"
              hitSlop={8}
            >
              <Feather name="chevron-left" size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              testID={testID ? `${testID}-next` : undefined}
              onPress={goNext}
              accessibilityRole="button"
              accessibilityLabel="Mois suivant"
              hitSlop={8}
            >
              <Feather name="chevron-right" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* En-têtes de jours. */}
          <View style={{ flexDirection: 'row' }}>
            {WEEKDAYS.map((d, i) => (
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

          {/* Grille. */}
          {weeks.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: spacing[1] }}>
              {row.map((cell) => {
                const selected = cell.key === value;
                const today = cell.key === todayKey;
                return (
                  <Pressable
                    key={cell.key}
                    testID={testID ? `${testID}-cell-${cell.key}` : undefined}
                    onPress={() => {
                      onChange(cell.key);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${cell.day}`}
                    accessibilityState={{ selected }}
                    style={{
                      flex: 1,
                      aspectRatio: 1,
                      borderRadius: radius.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: cell.inMonth ? 1 : 0.35,
                      backgroundColor: selected ? colors.accent : 'transparent',
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
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
