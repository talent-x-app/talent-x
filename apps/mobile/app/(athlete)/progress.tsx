import { useTheme } from '@talent-x/design-tokens';
import { ScrollView, Text, View } from 'react-native';
import { PersonalRecordsSection } from '../../src/athlete/PersonalRecordsSection';

/**
 * Onglet Progression athlète : records personnels (A-07 — TLX-091). Les graphes par
 * discipline (A-06 — TLX-090) viendront compléter cet écran au-dessus de la section.
 */
export default function AthleteProgressScreen() {
  const { colors, typography, spacing } = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <View style={{ gap: spacing[1] }}>
        <Text
          testID="progress-title"
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          Progression
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Tes meilleures marques, épreuve par épreuve.
        </Text>
      </View>
      <PersonalRecordsSection />
    </ScrollView>
  );
}
