import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { RoleGuard } from '../../src/auth/RoleGuard';

export default function AthleteLayout() {
  const { colors } = useTheme();

  return (
    <RoleGuard role="athlete">
      <Tabs
        // `history` : revenir d'une route hors tab bar (notifications, compétitions…) ramène
        // sur le **dernier onglet visité** (Profil) et non sur le 1er onglet (Accueil) — TLX-92.
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.accentText,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontFamily: 'Poppins_600SemiBold', fontSize: 10 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Accueil',
            tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="sessions"
          options={{
            title: 'Séances',
            tabBarIcon: ({ color, size }) => <Feather name="activity" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progression',
            tabBarIcon: ({ color, size }) => (
              <Feather name="trending-up" color={color} size={size} />
            ),
          }}
        />
        {/* Onglet Groupe (ADR-44 §3) — accès direct au(x) groupe(s), sort de Profil. */}
        <Tabs.Screen
          name="groups"
          options={{
            title: 'Groupe',
            tabBarIcon: ({ color, size }) => <Feather name="users" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
          }}
        />
        {/* Calendrier (ADR-44) : fusionné dans l'onglet Séances → routable mais masqué du tab bar. */}
        <Tabs.Screen name="calendar" options={{ href: null }} />
        {/* Détail séance + saisie de perf (A-03/A-04) : routable mais masqué du tab bar. */}
        <Tabs.Screen name="session/[id]" options={{ href: null }} />
        {/* Confirmation de perf (A-05) : routable mais masquée du tab bar. */}
        <Tabs.Screen name="perf/[id]" options={{ href: null }} />
        {/* Centre de notifications (TLX-111) : routable mais masqué du tab bar. */}
        <Tabs.Screen name="notifications" options={{ href: null }} />
        {/* Compétitions (TLX-101, ADR-24) : liste + détail lecture seule, hors tab bar. */}
        <Tabs.Screen name="competitions" options={{ href: null }} />
        <Tabs.Screen name="competition/[id]" options={{ href: null }} />
        {/* Rejoindre un groupe via code (TLX-88) : routable mais masqué du tab bar. */}
        <Tabs.Screen name="group/join" options={{ href: null }} />
        {/* Hub de groupe (ADR-43/44) : routable mais masqué du tab bar (atteint via l'onglet Groupe). */}
        <Tabs.Screen name="group/[id]" options={{ href: null }} />
      </Tabs>
    </RoleGuard>
  );
}
