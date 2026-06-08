/**
 * Bandeau hors-ligne global (TLX-010).
 *
 * Affiché en haut de l'écran (sous l'encoche, via les safe-area insets) dès que
 * la connectivité est perdue ; masqué une fois revenue. Style « warning » aligné
 * sur `design/preview/comp-toast-banner.html`. Les visuels dérivent des tokens.
 */
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@talent-x/design-tokens';
import { useNetworkStatus } from './useNetworkStatus';

export function OfflineBanner() {
  const online = useNetworkStatus();
  const { colors, typography, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();

  if (online) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + spacing[2],
        left: spacing[4],
        right: spacing[4],
      }}
    >
      <View
        accessibilityRole="alert"
        accessibilityLabel="Hors ligne. Pas de connexion internet."
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing[2],
          backgroundColor: colors.warningBg,
          borderRadius: radius.md,
          paddingVertical: spacing[3],
          paddingHorizontal: spacing[3],
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: colors.warning,
          }}
        />
        <Text
          style={{
            color: colors.warning,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Hors ligne — vérifiez votre connexion internet.
        </Text>
      </View>
    </View>
  );
}
