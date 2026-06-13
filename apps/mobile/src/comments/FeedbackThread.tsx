import { createComment, listComments, type Comment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { useToast } from '../feedback';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/dashboard-query';

/** Clé de cache du fil de commentaires d'une performance. */
export const performanceCommentsKey = (performanceId: string) =>
  ['performance', performanceId, 'comments'] as const;

/** Clé de cache du fil de commentaires d'une séance (discussion pré-séance, TLX-118). */
export const sessionCommentsKey = (sessionId: string) =>
  ['session', sessionId, 'comments'] as const;

/**
 * Fil de feedback/discussion rattaché à une **performance** (TLX-086/092) **ou** à une
 * **séance** (TLX-118). Une seule cible doit être fournie (`performanceId` XOR `sessionId`,
 * comme le contrat `/comments`). Partagé entre la revue coach (C-08), le détail séance
 * athlète (A-09) et la discussion pré-séance (athlète + coach). Affiche les commentaires
 * existants (`GET /comments`) et permet de répondre (`POST /comments`). Côté **perf**, poster
 * un feedback coach sort la perf de « à revoir » → le tableau de bord est invalidé. Lecture et
 * écriture sont autorisées aux parties liées (titulaire/coach), selon l'autorisation serveur.
 */
export function FeedbackThread({
  performanceId,
  sessionId,
  title = 'Feedback',
  composerPlaceholder,
  sendLabel,
  emptyHint,
}: {
  /** Cible performance (exclusif avec `sessionId`). */
  performanceId?: string;
  /** Cible séance (exclusif avec `performanceId`). */
  sessionId?: string;
  /** Intitulé de la section (ex. « Feedback » sur une perf, « Discussion » sur une séance). */
  title?: string;
  composerPlaceholder: string;
  sendLabel: string;
  emptyHint: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  // Cible du contrat /comments (séance XOR perf) + clé de cache associée.
  const target = sessionId ? { sessionId } : { performanceId: performanceId! };
  const queryKey = sessionId
    ? sessionCommentsKey(sessionId)
    : performanceCommentsKey(performanceId!);

  const comments = useQuery({
    queryKey,
    queryFn: async (): Promise<Comment[]> => {
      const response = await listComments(target);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (): Promise<Comment> => {
      const response = await createComment({ ...target, body: body.trim() });
      if (response.status === 201) return response.data;
      throw response;
    },
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey });
      // Côté coach, un feedback sur une **perf** sort la perf de « à revoir » → rafraîchir le
      // dashboard. Inutile pour une discussion de séance (qui ne change aucun statut dérivé).
      if (performanceId) {
        void queryClient.invalidateQueries({ queryKey: COACH_DASHBOARD_QUERY_KEY });
      }
      toast.show({ title: 'Message envoyé', variant: 'success' });
    },
    onError: () => {
      toast.show({
        title: 'Échec de l’envoi',
        description: 'Réessaie dans un instant.',
        variant: 'danger',
      });
    },
  });

  const canSend = body.trim().length > 0 && !mutation.isPending;

  return (
    <View style={{ gap: spacing[3] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {title}
      </Text>

      {comments.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : comments.data && comments.data.length > 0 ? (
        <View style={{ gap: spacing[2] }}>
          {comments.data.map((c) => (
            <Card key={c.id} testID={`comment-${c.id}`}>
              <View style={{ gap: spacing[1] }}>
                <Text
                  style={{
                    color: colors.textPrimary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.body.fontSize,
                  }}
                >
                  {c.body}
                </Text>
                {c.createdAt ? (
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.caption.fontSize,
                    }}
                  >
                    {formatDateTime(c.createdAt)}
                  </Text>
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <Text
          testID="feedback-empty"
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {emptyHint}
        </Text>
      )}

      <TextInput
        testID="feedback-input"
        value={body}
        onChangeText={setBody}
        placeholder={composerPlaceholder}
        placeholderTextColor={colors.textMuted}
        multiline
        style={{
          minHeight: 88,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
          padding: spacing[4],
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.body.fontSize,
          textAlignVertical: 'top',
        }}
      />
      <Button
        testID="feedback-send"
        onPress={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!canSend}
        size="lg"
      >
        {sendLabel}
      </Button>
    </View>
  );
}

/** Date + heure courtes FR (ex. « 9 juin 2026, 10:00 »). */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
