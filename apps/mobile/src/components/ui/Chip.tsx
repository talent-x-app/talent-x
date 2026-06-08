import { type ReactNode } from 'react';
import { Pressable, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

export interface ChipProps {
  children: string;
  selected?: boolean;
  onPress?: () => void;
  leftIcon?: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Chip / filtre du design system (TLX-006). État sélectionné accentué, pill.
 * Sélectionnable au tap quand `onPress` est fourni.
 */
export function Chip({
  children,
  selected = false,
  onPress,
  leftIcon,
  disabled = false,
  style,
  testID,
}: ChipProps) {
  const theme = useTheme();
  const { colors, typography, spacing, radius, borderWidth, opacity } = theme;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[2],
          height: 32,
          paddingHorizontal: spacing[3],
          borderRadius: radius.pill,
          borderWidth: borderWidth.hairline,
          borderColor: selected ? colors.accent : 'transparent',
          backgroundColor: selected ? colors.accentSubtle : colors.surfaceSunken,
          opacity: disabled ? opacity.disabled : pressed ? opacity.muted : 1,
        },
        style,
      ]}
    >
      {leftIcon != null && <View>{leftIcon}</View>}
      <Text
        style={{
          color: selected ? colors.accentText : colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
