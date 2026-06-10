import { listNotifications, type NotificationPage } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { Card } from '../components/ui';
import { NOTIFICATIONS_QUERY_KEY } from './NotificationsScreen';

/**
 * Entrée « Notifications » du Profil (TLX-111, ADR-23) : ouvre le centre de
 * notifications du groupe de routes courant, avec badge de non-lues. Partage le
 * cache du centre (même clé) — l'ouverture du centre remet le badge à zéro.
 */
export function NotificationsLink() {
  const { colors, typography, spacing } = useTheme();
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

  return (
    <Pressable
      testID="profile-notifications-link"
      onPress={() =>
        router.push(
          (role === 'coach' ? '/(coach)/notifications' : '/(athlete)/notifications') as never,
        )
      }
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              backgroundColor: colors.accentSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="bell" size={18} color={colors.accentText} />
          </View>
          <Text
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            Notifications
          </Text>
          {unread > 0 ? (
            <View
              testID="profile-notifications-badge"
              style={{
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                paddingHorizontal: 6,
                backgroundColor: colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: colors.surface,
                  fontFamily: typography.fontFamily.bold,
                  fontSize: typography.caption.fontSize,
                }}
              >
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          ) : null}
          <Feather name="chevron-right" size={18} color={colors.textMuted} />
        </View>
      </Card>
    </Pressable>
  );
}
