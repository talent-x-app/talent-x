import { useTheme } from '@talent-x/design-tokens';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const theme = useTheme();
  const { colors, typography, spacing } = theme;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: spacing[6] }]}>
      <StatusBar style={theme.name === 'dark' ? 'light' : 'dark'} />
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h1.fontSize,
          lineHeight: typography.h1.lineHeight,
          letterSpacing: typography.h1.letterSpacing,
        }}
      >
        Talent-X
      </Text>
      <Text
        style={{
          marginTop: spacing[2],
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
          lineHeight: typography.body.lineHeight,
        }}
      >
        Fondations — design system
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
