import { useTheme } from '@talent-x/design-tokens';
import { StyleSheet, Text, View } from 'react-native';

// Tableau de bord coach (C-01) — placeholder TLX-007.
export default function CoachHomeScreen() {
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
        Accueil Coach
      </Text>
      <Text
        style={{
          marginTop: spacing[2],
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
        }}
      >
        C-01 — TLX-046
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
