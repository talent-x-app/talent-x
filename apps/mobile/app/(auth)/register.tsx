import { useTheme } from '@talent-x/design-tokens';
import { StyleSheet, Text, View } from 'react-native';

// Placeholder — implémenté dans TLX-026 (Inscription + choix du rôle, O-03/O-04).
// Présent dès TLX-025 pour que le lien « Créer un compte » de l'écran Connexion
// pointe vers une route existante.
export default function RegisterScreen() {
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
        Créer un compte
      </Text>
      <Text
        style={{
          marginTop: spacing[2],
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
        }}
      >
        Écrans O-03 / O-04 — TLX-026
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
