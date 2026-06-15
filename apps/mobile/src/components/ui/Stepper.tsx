import { Feather } from '@expo/vector-icons';
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

export interface StepperProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Formatage de la valeur affichée (ex. `(v) => \`${v} %\``). Défaut : l'entier brut. */
  format?: (value: number) => string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Stepper numérique du design system (ADR-39) — incrément/décrément borné, ex. répétitions,
 * séries, % du record. Pas de saisie clavier : les deux boutons suffisent pour des petites
 * plages bornées (alternative au `Slider` pour des valeurs discrètes basses). Accessible :
 * rôle « adjustable » + actions incrémenter/décrémenter sur le conteneur.
 */
export function Stepper({
  value,
  onValueChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
  disabled = false,
  format,
  style,
  testID,
  accessibilityLabel,
}: StepperProps) {
  const { colors, typography, spacing, radius, borderWidth, opacity } = useTheme();

  const atMin = value <= min;
  const atMax = value >= max;
  const emit = (next: number) => {
    if (disabled) return;
    const clamped = clamp(next, min, max);
    if (clamped !== value) onValueChange(clamped);
  };

  const button = (dir: -1 | 1, name: 'minus' | 'plus', off: boolean) => (
    <Pressable
      testID={testID ? `${testID}-${dir < 0 ? 'dec' : 'inc'}` : undefined}
      onPress={() => emit(value + dir * step)}
      disabled={disabled || off}
      accessibilityRole="button"
      accessibilityLabel={dir < 0 ? 'Diminuer' : 'Augmenter'}
      accessibilityState={{ disabled: disabled || off }}
      style={({ pressed }) => ({
        width: 42,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: off ? opacity.disabled : pressed ? opacity.muted : 1,
      })}
    >
      <Feather name={name} size={18} color={colors.textPrimary} />
    </Pressable>
  );

  return (
    <View
      testID={testID}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') emit(value + step);
        else if (event.nativeEvent.actionName === 'decrement') emit(value - step);
      }}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          height: 42,
          borderRadius: radius.sm,
          borderWidth: borderWidth.hairline,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surfaceSunken,
          opacity: disabled ? opacity.disabled : 1,
        },
        style,
      ]}
    >
      {button(-1, 'minus', atMin)}
      <Text
        testID={testID ? `${testID}-value` : undefined}
        style={{
          minWidth: 44,
          textAlign: 'center',
          paddingHorizontal: spacing[1],
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.semibold,
          fontSize: typography.body.fontSize,
        }}
      >
        {format ? format(value) : String(value)}
      </Text>
      {button(1, 'plus', atMax)}
    </View>
  );
}
