import { getSession, type Session } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { SESSION_STATUS_META } from '../calendar/calendar-model';
import { formatSessionDate } from '../athlete/athlete-session-ui';
import { SessionContent } from '../sessions/session-content-ui';
import { CoachBriefReview } from './brief-editor';
import { assignSessionHref, editSessionHref } from './navigation';

/**
 * Détail d'une séance côté coach (C-05) en **lecture seule** — mode par défaut, découplé du
 * constructeur. Consomme `GET /sessions/:id` (le coach lit le brief complet : `intent` +
 * `coachNotes`). Réutilise `SessionContent` (groupes ADR-27, cibles, brief partagé) et expose
 * les actions **Éditer** (→ constructeur) et **Assigner** (→ C-06). États chargement / erreur.
 */
export function CoachSessionDetailScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const session = useQuery({
    queryKey: ['session', id],
    queryFn: async (): Promise<Session> => {
      const response = await getSession(id);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const statusMeta = session.data ? SESSION_STATUS_META[session.data.status] : undefined;
  const exercises = session.data?.exercises?.items ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <Pressable
        testID="coach-session-back"
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
          Séances
        </Text>
      </Pressable>

      {session.isLoading ? (
        <View testID="coach-session-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : session.isError || !session.data ? (
        <Card testID="coach-session-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger cette séance.
            </Text>
            <Button testID="coach-session-retry" onPress={() => void session.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : (
        <>
          <View style={{ gap: spacing[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text
                testID="coach-session-title"
                style={{
                  flex: 1,
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.bold,
                  fontSize: typography.h2.fontSize,
                }}
              >
                {session.data.title}
              </Text>
              {statusMeta ? (
                <View
                  testID="coach-session-status"
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    backgroundColor:
                      statusMeta.tone === 'accent' ? colors.accentSubtle : colors.surfaceSunken,
                  }}
                >
                  <Text
                    style={{
                      color:
                        statusMeta.tone === 'accent' ? colors.accentText : colors.textSecondary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    {statusMeta.label}
                  </Text>
                </View>
              ) : null}
            </View>
            {session.data.scheduledDate ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {formatSessionDate(session.data.scheduledDate)}
              </Text>
            ) : null}
            {session.data.description ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                }}
              >
                {session.data.description}
              </Text>
            ) : null}
          </View>

          {/* Lecture coach du brief (ADR-28) : intention + notes internes (régression/progression/prudence). */}
          <CoachBriefReview brief={session.data.brief} />

          {/* Contenu partagé : brief athlète + exercices (groupes ADR-27) + Réussi/Stop. */}
          <SessionContent exercises={exercises} brief={session.data.brief} />

          <Button
            testID="coach-session-edit"
            onPress={() => router.push(editSessionHref(id))}
            leftIcon={<Feather name="edit-3" size={18} color={colors.textOnAccent} />}
            size="lg"
          >
            Éditer la séance
          </Button>
          <Button
            testID="coach-session-assign"
            onPress={() => router.push(assignSessionHref(id, session.data.title))}
            variant="secondary"
            leftIcon={<Feather name="user-plus" size={18} color={colors.textPrimary} />}
          >
            Assigner à des athlètes
          </Button>
        </>
      )}
    </ScrollView>
  );
}
