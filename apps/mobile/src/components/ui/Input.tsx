import { forwardRef, useState } from 'react';
import {
  type StyleProp,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

/**
 * Champ de saisie du design system (TLX-006). Label optionnel, état d'erreur,
 * focus accentué. Relaie toutes les props de TextInput (secureTextEntry, etc.).
 */
export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, error, containerStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const { colors, typography, spacing, radius, borderWidth } = theme;
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.accent : colors.borderStrong;

  return (
    <View style={[{ gap: spacing[2] }, containerStyle]}>
      {label != null && (
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {label}
        </Text>
      )}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        accessibilityState={{ disabled: rest.editable === false }}
        style={{
          height: 48,
          paddingHorizontal: spacing[4],
          borderRadius: radius.sm,
          borderWidth: focused || error ? borderWidth.focus : borderWidth.hairline,
          borderColor,
          backgroundColor: colors.surface,
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
        }}
        {...rest}
      />
      {error != null && (
        <Text
          style={{
            color: colors.danger,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {error}
        </Text>
      )}
    </View>
  );
});
