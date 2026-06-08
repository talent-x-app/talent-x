import { type ReactNode } from 'react';
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  /** Désactive le padding interne (utile pour les cartes à contenu plein cadre). */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * Carte de surface du design system (TLX-006). Surface + bordure + rayon + élévation
 * issus des tokens (en thème sombre l'élévation est une bordure, pas une ombre).
 * Devient pressable si `onPress` est fourni.
 */
export function Card({
  children,
  onPress,
  padded = true,
  style,
  testID,
  accessibilityLabel,
}: CardProps) {
  const theme = useTheme();
  const { colors, radius, borderWidth, spacing, elevation } = theme;

  const baseStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    padding: padded ? spacing[4] : 0,
    ...elevation.sm,
  };

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [baseStyle, { opacity: pressed ? 0.92 : 1 }, style]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View testID={testID} accessibilityLabel={accessibilityLabel} style={[baseStyle, style]}>
      {children}
    </View>
  );
}
