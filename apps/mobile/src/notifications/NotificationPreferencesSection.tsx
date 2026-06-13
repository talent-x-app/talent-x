import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Switch, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';

/** Clé de cache des préférences de notification. */
export const NOTIFICATION_PREFERENCES_QUERY_KEY = ['notification-preferences'] as const;

const PREFERENCE_ROWS: { key: keyof NotificationPreferences; label: string }[] = [
  { key: 'sessionAssigned', label: 'Séance affectée' },
  { key: 'performanceFeedback', label: 'Feedback du coach' },
  { key: 'performanceSubmitted', label: 'Performance à revoir' },
  { key: 'groupUpdates', label: 'Vie du groupe' },
  { key: 'marketing', label: 'Actualités Talent-X' },
];

/**
 * Préférences de notification (TLX-111, ADR-22) — 4 interrupteurs branchés sur
 * `GET/PUT /notifications/preferences`, mise à jour optimiste (rollback + toast en
 * cas d'échec). Rendu en section du Profil (pattern « Préférences » de l'UI kit).
 */
export function NotificationPreferencesSection() {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();

  const preferences = useQuery({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    queryFn: async (): Promise<NotificationPreferences> => {
      const response = await getNotificationPreferences();
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const save = useMutation({
    mutationFn: async (changes: NotificationPreferences): Promise<NotificationPreferences> => {
      const response = await updateNotificationPreferences(changes);
      if (response.status === 200) return response.data;
      throw response;
    },
    // Optimiste : l'interrupteur bascule immédiatement, rollback si le PUT échoue.
    onMutate: async (changes) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPreferences>(
        NOTIFICATION_PREFERENCES_QUERY_KEY,
      );
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, {
        ...previous,
        ...changes,
      });
      return { previous };
    },
    onError: (error: unknown, _changes, context) => {
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, context?.previous);
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, updated);
    },
  });

  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Notifications
      </Text>
      <Card testID="notification-preferences">
        {preferences.isLoading ? (
          <Text
            testID="notification-preferences-loading"
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Chargement des préférences…
          </Text>
        ) : preferences.isError ? (
          <Text
            testID="notification-preferences-error"
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Préférences indisponibles pour le moment.
          </Text>
        ) : preferences.data ? (
          <View style={{ gap: spacing[4] }}>
            {PREFERENCE_ROWS.map(({ key, label }) => (
              <View
                key={key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
              >
                <Text
                  style={{
                    flex: 1,
                    color: colors.textPrimary,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.body.fontSize,
                  }}
                >
                  {label}
                </Text>
                <Switch
                  testID={`notification-pref-${key}`}
                  value={preferences.data[key] ?? false}
                  onValueChange={(value) => save.mutate({ [key]: value })}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={colors.surface}
                />
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}
