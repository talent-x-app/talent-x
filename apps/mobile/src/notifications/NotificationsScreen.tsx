import {
  listNotifications,
  readAllNotifications,
  type Notification,
  type NotificationPage,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { Button, Card } from '../components/ui';
import {
  NOTIFICATION_PRESENTATIONS,
  formatRelativeDate,
  notificationHref,
} from './notification-ui';

/** Clé de cache du feed (badge du Profil + centre). */
export const NOTIFICATIONS_QUERY_KEY = ['notifications', 'me'] as const;

/**
 * Centre de notifications (TLX-111, ADR-23) : feed in-app paginé, marquage
 * « tout lu » à l'ouverture (dès qu'une page avec des non-lues arrive), navigation
 * vers la ressource selon le type et le rôle. États chargement / erreur / vide.
 */
export function NotificationsScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const readAll = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await readAllNotifications();
      if (response.status !== 200) throw response;
    },
    // Le badge tombe à zéro partout (Profil compris) ; les items restent affichés.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });

  // « Tout lu » une seule fois par ouverture, quand le feed chargé contient des non-lues.
  const marked = useRef(false);
  useEffect(() => {
    if (!marked.current && feed.data && feed.data.unreadCount > 0) {
      marked.current = true;
      readAll.mutate();
    }
  }, [feed.data, readAll]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <Text
        testID="notifications-title"
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h2.fontSize,
        }}
      >
        Notifications
      </Text>

      {feed.isLoading ? (
        <View testID="notifications-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : feed.isError ? (
        <Card testID="notifications-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger tes notifications.
            </Text>
            <Button testID="notifications-retry" onPress={() => void feed.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : feed.data && feed.data.data.length === 0 ? (
        <Card testID="notifications-empty">
          <View style={{ alignItems: 'center', gap: spacing[2] }}>
            <Feather name="bell-off" size={22} color={colors.textMuted} />
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Rien pour l’instant — les nouveautés de ton entraînement arriveront ici.
            </Text>
          </View>
        </Card>
      ) : feed.data ? (
        <View style={{ gap: spacing[3] }}>
          {feed.data.data.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onPress={() => {
                if (!role) return;
                const href = notificationHref(role, notification.type, notification.resourceId);
                if (href) router.push(href as never);
              }}
            />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function NotificationItem({
  notification,
  onPress,
}: {
  notification: Notification;
  onPress: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const presentation = NOTIFICATION_PRESENTATIONS[notification.type];
  const unread = !notification.readAt;

  return (
    <Pressable testID={`notification-${notification.id}`} onPress={onPress}>
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
            <Feather name={presentation.icon} size={18} color={colors.accentText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: colors.textPrimary,
                fontFamily: unread ? typography.fontFamily.bold : typography.fontFamily.medium,
                fontSize: typography.body.fontSize,
              }}
            >
              {presentation.title}
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {presentation.description} · {formatRelativeDate(notification.createdAt, new Date())}
            </Text>
          </View>
          {unread ? (
            <View
              testID={`notification-${notification.id}-unread`}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: colors.accent,
              }}
            />
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
