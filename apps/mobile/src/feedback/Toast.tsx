import { Pressable, Text, View } from 'react-native';
import { useTheme } from '@talent-x/design-tokens';
import { type ToastVariant } from './types';

export interface ToastProps {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Appelé au tap sur le toast (rejet manuel). */
  onDismiss?: () => void;
  testID?: string;
}

/** Glyphe de l'icône par variante (pas de dépendance d'icônes : Text suffit). */
const GLYPH: Record<ToastVariant, string> = {
  success: '✓',
  danger: '✕',
  warning: '!',
  info: 'i',
};

/**
 * Toast présentationnel (TLX-010), aligné sur `design/preview/comp-toast-banner.html` :
 * surface + bordure + élévation md, pastille d'icône colorée par variante, titre
 * en gras + description. Tous les visuels dérivent des tokens (aucune valeur en dur).
 */
export function Toast({ title, description, variant = 'info', onDismiss, testID }: ToastProps) {
  const { colors, typography, spacing, radius, borderWidth, elevation } = useTheme();

  const accent = colors[variant];
  const accentBg = colors[`${variant}Bg` as const];

  return (
    <Pressable
      testID={testID}
      onPress={onDismiss}
      accessibilityRole="alert"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        backgroundColor: colors.surfaceRaised,
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
        borderColor: colors.border,
        paddingVertical: spacing[3],
        paddingHorizontal: spacing[3],
        ...elevation.md,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accentBg,
        }}
      >
        <Text
          style={{
            color: accent,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {GLYPH[variant]}
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.semibold,
            fontSize: typography.bodySm.fontSize,
            lineHeight: typography.bodySm.lineHeight,
          }}
        >
          {title}
        </Text>
        {description != null && (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
              lineHeight: typography.bodySm.lineHeight,
            }}
          >
            {description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
