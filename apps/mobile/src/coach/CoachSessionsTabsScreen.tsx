import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SegmentedTabs } from '../components/ui';
import { CoachCalendarScreen } from '../calendar/CoachCalendarScreen';
import { CoachSessionsScreen } from './CoachSessionsScreen';

/**
 * Hub **Séances** coach (ADR-53) : remplace l'onglet Calendrier par une surface unique à bascule
 * **Liste ⇄ Calendrier** (même patron que l'athlète, `AthleteSessionsTabsScreen`). La Liste
 * (`CoachSessionsScreen`) répartit les séances en À venir / Passées / Brouillons / Modèles ; le
 * Calendrier réutilise `CoachCalendarScreen` en mode embarqué. En-tête : titre + « Nouvelle séance ».
 */
export function CoachSessionsTabsScreen({
  initialView = 'list',
}: {
  initialView?: 'list' | 'calendar';
}) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const [view, setView] = useState<'list' | 'calendar'>(initialView);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing[6], paddingTop: spacing[6], gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <Text
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.h2.fontSize,
            }}
          >
            Séances
          </Text>
          <Pressable
            testID="coach-sessions-new"
            onPress={() => router.push('/(coach)/session/new')}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle séance"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing[1],
              paddingVertical: spacing[2],
              paddingHorizontal: spacing[3],
              borderRadius: 999,
              backgroundColor: colors.accent,
            }}
          >
            <Feather name="plus" size={16} color={colors.textOnAccent} />
            <Text
              style={{
                color: colors.textOnAccent,
                fontFamily: typography.fontFamily.semibold,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Nouvelle séance
            </Text>
          </Pressable>
        </View>
        <SegmentedTabs
          testID="coach-sessions-view-tabs"
          items={[
            { key: 'list', label: 'Liste' },
            { key: 'calendar', label: 'Calendrier' },
          ]}
          activeKey={view}
          onChange={(k) => setView(k as 'list' | 'calendar')}
        />
      </View>
      <View style={{ flex: 1 }}>
        {view === 'list' ? <CoachSessionsScreen /> : <CoachCalendarScreen embedded />}
      </View>
    </View>
  );
}
