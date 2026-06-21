import { useTheme } from '@talent-x/design-tokens';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { SegmentedTabs } from '../components/ui';
import { AthleteCalendarScreen } from '../calendar/AthleteCalendarScreen';
import { AthleteSessionsScreen } from './AthleteSessionsScreen';

/**
 * Surface **Séances** unifiée (ADR-44 §2) : un seul onglet avec bascule **Liste ⇄ Calendrier**,
 * réutilisant les écrans éprouvés A-02 (`AthleteSessionsScreen`) et A-08 (`AthleteCalendarScreen`,
 * qui porte aussi les compétitions, ADR-24). Remplace les deux anciens onglets séparés et supprime
 * la triple redondance (le hub de groupe ne re-liste plus les séances). `initialView` permet à la
 * route Calendrier (raccourci accueil) d'ouvrir directement la vue calendrier.
 */
export function AthleteSessionsTabsScreen({
  initialView = 'list',
}: {
  initialView?: 'list' | 'calendar';
}) {
  const { colors, typography, spacing } = useTheme();
  const [view, setView] = useState<'list' | 'calendar'>(initialView);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: spacing[6], paddingTop: spacing[6], gap: spacing[3] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          Séances
        </Text>
        <SegmentedTabs
          testID="sessions-view-tabs"
          items={[
            { key: 'list', label: 'Liste' },
            { key: 'calendar', label: 'Calendrier' },
          ]}
          activeKey={view}
          onChange={(k) => setView(k as 'list' | 'calendar')}
        />
      </View>
      <View style={{ flex: 1 }}>
        {view === 'list' ? <AthleteSessionsScreen embedded /> : <AthleteCalendarScreen embedded />}
      </View>
    </View>
  );
}
