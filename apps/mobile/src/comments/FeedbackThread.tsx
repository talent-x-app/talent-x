import { createComment, listComments, type Comment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { useToast } from '../feedback';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/CoachDashboardScreen';

/** Clé de cache du fil de commentaires d'une performance. */
export const performanceCommentsKey = (performanceId: string) =>
  ['performance', performanceId, 'comments'] as const;

/**
 * Fil de feedback rattaché à une **performance** (TLX-086/092). Partagé entre la revue
 * coach (C-08) et le détail séance athlète (A-09) : affiche les commentaires existants
 * (`GET /comments?performanceId=…`) et permet de répondre (`POST /comments`). Côté coach,
 * poster sort la perf de « à revoir » (le tableau de bord est invalidé). Lecture et
 * écriture sont autorisées au titulaire (athlète) comme au coach lié+consenti.
 */
export function FeedbackThread({
  performanceId,
  composerPlaceholder,
  sendLabel,
  emptyHint,
}: {
  performanceId: string;
  composerPlaceholder: string;
  sendLabel: string;
  emptyHint: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const comments = useQuery({
    queryKey: performanceCommentsKey(performanceId),
    queryFn: async (): Promise<Comment[]> => {
      const response = await listComments({ performanceId });
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (): Promise<Comment> => {
      const response = await createComment({ performanceId, body: body.trim() });
      if (response.status === 201) return response.data;
      throw response;
    },
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: performanceCommentsKey(performanceId) });
      // Côté coach, un feedback sort la perf de « à revoir » → rafraîchir le dashboard
      // (no-op inoffensif côté athlète, qui n'a pas cette requête en cache).
      void queryClient.invalidateQueries({ queryKey: COACH_DASHBOARD_QUERY_KEY });
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
        Feedback
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
