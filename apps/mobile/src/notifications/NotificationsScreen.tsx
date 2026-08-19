import {
  listNotifications,
  readAllNotifications,
  readNotification,
  type Notification,
  type NotificationPage,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSession } from '../auth/SessionProvider';
import { Button, Card } from '../components/ui';
import {
  NOTIFICATION_PRESENTATIONS,
  formatRelativeDate,
  notificationDescription,
  notificationHref,
} from './notification-ui';

/** Clé de cache du feed (badge du Profil + centre). */
export const NOTIFICATIONS_QUERY_KEY = ['notifications', 'me'] as const;

/**
 * Centre de notifications (TLX-111, ADR-23) : feed in-app paginé, navigation vers la
 * ressource selon le type et le rôle. États chargement / erreur / vide.
 *
 * Lecture **par item** (TLX-189, évolution additive anticipée par l'ADR-23) : ouvrir le centre
 * ne marque plus tout lu d'un coup — les notifications sans filet d'état métier (annonces,
 * réponses, kudos) gardaient sinon leur seul indice « non-lu » effacé sans avoir été vues.
 * Une notification passe lue **au tap** (optimiste, avant navigation) ; « Tout marquer lu »
 * reste disponible en action explicite.
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

  // Lecture unitaire au tap (TLX-189) : optimiste — l'item passe lu et le badge décrémente
  // immédiatement (la navigation suit) ; best-effort, un échec réseau est réconcilié par la
  // prochaine invalidation (le serveur reste la source de vérité).
  const readOne = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const response = await readNotification(id);
      if (response.status !== 200) throw response;
    },
    onMutate: (id: string) => {
      queryClient.setQueryData<NotificationPage>(NOTIFICATIONS_QUERY_KEY, (page) => {
        if (!page) return page;
        const target = page.data.find((n) => n.id === id);
        if (!target || target.readAt) return page;
        return {
          ...page,
          data: page.data.map((n) =>
            n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
          ),
          unreadCount: Math.max(0, page.unreadCount - 1),
        };
      });
    },
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      // Tirer-pour-rafraîchir (TLX-237) : c'est le geste que tout utilisateur tente en
      // premier, et il n'existait pas. Il compte double ici — cet écran est déclaré en
      // `Tabs.Screen … href: null`, donc jamais démonté : `refetchOnMount` ne s'y rejoue
      // jamais, et le bouton « Réessayer » n'apparaît qu'en cas d'erreur.
      refreshControl={
        <RefreshControl
          testID="notifications-refresh"
          refreshing={feed.isRefetching}
          onRefresh={() => void feed.refetch()}
          tintColor={colors.textSecondary}
        />
      }
    >
      {/* Retour explicite (TLX-92) : route empilée hors tab bar — sans cette affordance, seul le
          geste/bouton système permettait de revenir, et il ramenait sur l'Accueil. */}
      <Pressable
        testID="notifications-back"
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}
      >
        <Feather name="chevron-left" size={22} color={colors.textSecondary} />
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Retour
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Text
          testID="notifications-title"
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          Notifications
        </Text>
        {feed.data && feed.data.unreadCount > 0 ? (
          <Pressable
            testID="notifications-read-all"
            onPress={() => readAll.mutate()}
            accessibilityRole="button"
            accessibilityLabel="Tout marquer comme lu"
            hitSlop={8}
          >
            <Text
              style={{
                color: colors.accentText,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Tout marquer lu
            </Text>
          </Pressable>
        ) : null}
      </View>

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
                // Lue au tap (TLX-189) — même sans cible navigable pour ce rôle.
                if (!notification.readAt) readOne.mutate(notification.id);
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
  // Description nominative (ADR-55) si l'API a résolu l'acteur ; repli générique sinon.
  const description = notificationDescription(notification.type, notification.actor?.displayName);
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
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {description} · {formatRelativeDate(notification.createdAt, new Date())}
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
