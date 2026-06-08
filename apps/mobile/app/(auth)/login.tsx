import { useTheme } from '@talent-x/design-tokens';
import { StyleSheet, Text, View } from 'react-native';

// Placeholder — implémenté dans TLX-025.
export default function LoginScreen() {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: spacing[6] }]}>
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h2.fontSize,
        }}
      >
        Connexion
      </Text>
      <Text
        style={{
          marginTop: spacing[2],
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
        }}
      >
        Écran O-02 — TLX-025
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
