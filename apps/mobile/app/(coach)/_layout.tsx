import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { RoleGuard } from '../../src/auth/RoleGuard';

export default function CoachLayout() {
  const { colors } = useTheme();

  return (
    <RoleGuard role="coach">
      <Tabs
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
          name="athletes"
          options={{
            title: 'Athlètes',
            tabBarIcon: ({ color, size }) => <Feather name="users" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendrier',
            tabBarIcon: ({ color, size }) => <Feather name="calendar" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
          }}
        />
        {/* Détail athlète (C-03) : routable mais masqué du tab bar. */}
        <Tabs.Screen name="athlete/[id]" options={{ href: null }} />
        {/* Revue de perf (C-08) : routable mais masquée du tab bar. */}
        <Tabs.Screen name="review/[id]" options={{ href: null }} />
        {/* Détail (lecture seule) + constructeur (C-05) : routables mais masqués du tab bar. */}
        <Tabs.Screen name="session/new" options={{ href: null }} />
        <Tabs.Screen name="session/[id]" options={{ href: null }} />
        <Tabs.Screen name="session/[id]/edit" options={{ href: null }} />
        {/* Bibliothèque de modèles de séance (C-10, TLX-064) : routable mais masquée du tab bar. */}
        <Tabs.Screen name="templates" options={{ href: null }} />
        {/* Assignation de séance (C-06/C-07) : routable mais masquée du tab bar. */}
        <Tabs.Screen name="assign/[id]" options={{ href: null }} />
        {/* Compétitions (TLX-101, ADR-24) : liste / création / édition / engagement, hors tab bar. */}
        <Tabs.Screen name="competitions" options={{ href: null }} />
        <Tabs.Screen name="competition/new" options={{ href: null }} />
        <Tabs.Screen name="competition/[id]" options={{ href: null }} />
        <Tabs.Screen name="competition/[id]/engage" options={{ href: null }} />
        {/* Centre de notifications (TLX-111) : routable mais masqué du tab bar. */}
        <Tabs.Screen name="notifications" options={{ href: null }} />
        {/* Groupes (TLX-87) : liste + détail/gestion + code d'invitation, hors tab bar. */}
        <Tabs.Screen name="groups" options={{ href: null }} />
        <Tabs.Screen name="group/[id]" options={{ href: null }} />
      </Tabs>
    </RoleGuard>
  );
}
