import { listNotifications, type NotificationPage } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { NOTIFICATIONS_QUERY_KEY } from './NotificationsScreen';

/**
 * Cloche de notifications persistante (TLX-92) — pour les en-têtes d'écran. Comble un défaut de
 * découvrabilité : le centre n'était accessible que via une entrée enfouie du Profil
 * (`NotificationsLink`). Partage le même cache (`NOTIFICATIONS_QUERY_KEY`) que le Profil et le
 * centre — l'ouverture du centre remet le badge à zéro (mark-all-read). Navigue vers le centre du
 * groupe de routes courant selon le rôle.
 */
export function NotificationsBell() {
  const { colors, typography } = useTheme();
  const router = useRouter();
  const { role } = useSession();

  const feed = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async (): Promise<NotificationPage> => {
      const response = await listNotifications({ page: 1, limit: 50 });
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const unread = feed.data?.unreadCount ?? 0;
  const hasUnread = unread > 0;

  return (
    <Pressable
      testID="notifications-bell"
      onPress={() =>
        router.push(
          (role === 'coach' ? '/(coach)/notifications' : '/(athlete)/notifications') as never,
        )
      }
      accessibilityRole="button"
      accessibilityLabel={hasUnread ? `Notifications, ${unread} non lues` : 'Notifications'}
      hitSlop={8}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.surfaceSunken,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather name="bell" size={20} color={colors.textSecondary} />
      {hasUnread ? (
        <View
          testID="notifications-bell-badge"
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.background,
          }}
        >
          <Text
            style={{
              color: colors.surface,
              fontFamily: typography.fontFamily.bold,
              fontSize: 9,
              lineHeight: 12,
            }}
          >
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
