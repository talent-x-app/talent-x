import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useTheme, type Theme } from '@talent-x/design-tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  children: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 48, lg: 52 };
const FONT_SIZE: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 17 };
const PADDING_X: Record<ButtonSize, number> = { sm: 14, md: 20, lg: 20 };

interface VariantColors {
  background: string;
  backgroundPressed: string;
  text: string;
  border: string;
}

function variantColors(theme: Theme, variant: ButtonVariant): VariantColors {
  const { colors } = theme;
  switch (variant) {
    case 'secondary':
      return {
        background: 'transparent',
        backgroundPressed: colors.surfaceSunken,
        text: colors.textPrimary,
        border: colors.borderStrong,
      };
    case 'ghost':
      return {
        background: 'transparent',
        backgroundPressed: colors.accentSubtle,
        text: colors.accentText,
        border: 'transparent',
      };
    case 'danger':
      return {
        background: colors.danger,
        backgroundPressed: colors.danger,
        text: colors.textOnAccent,
        border: 'transparent',
      };
    case 'primary':
    default:
      return {
        background: colors.accent,
        backgroundPressed: colors.accentPressed,
        text: colors.textOnAccent,
        border: 'transparent',
      };
  }
}

/**
 * Bouton du design system (TLX-006). Variantes primary/secondary/ghost/danger,
 * tailles sm/md/lg. Toutes les valeurs dérivent des tokens (useTheme).
 */
export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  leftIcon,
  style,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const v = variantColors(theme, variant);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? children}
      hitSlop={size === 'sm' ? theme.spacing[1] : 0}
      style={({ pressed }) => [
        {
          height: HEIGHT[size],
          paddingHorizontal: PADDING_X[size],
          borderRadius: theme.radius.sm,
          borderWidth: theme.borderWidth.hairline,
          borderColor: v.border,
          backgroundColor: pressed ? v.backgroundPressed : v.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing[2],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? theme.opacity.disabled : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <>
          {leftIcon != null && <View>{leftIcon}</View>}
          <Text
            numberOfLines={1}
            style={{
              color: v.text,
              fontFamily: theme.typography.fontFamily.semibold,
              fontSize: FONT_SIZE[size],
            }}
          >
            {children}
          </Text>
        </>
      )}
    </Pressable>
  );
}
