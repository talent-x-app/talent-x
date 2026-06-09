import {
  createComment,
  getPerformance,
  listComments,
  type Comment,
  type Performance,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { useToast } from '../feedback';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/CoachDashboardScreen';

/** Réponse 403 dont le code métier indique un consentement manquant. */
function isConsentRequired(error: unknown): boolean {
  const e = error as { status?: number; data?: { error?: string } } | undefined;
  return e?.status === 403 && e?.data?.error === 'CONSENT_REQUIRED';
}

/**
 * Écran Revue de performance + feedback (C-08 — TLX-086). Le coach lit la performance
 * d'un athlète (`GET /assignments/:id/performance`, consent-gated), voit le fil de
 * feedback existant (`GET /comments?performanceId=…`) et poste son commentaire
 * (`POST /comments`). Poster un commentaire coach sort la performance de « à revoir »
 * (dérivation tableau de bord). États chargement / consentement / erreur.
 */
export function CoachReviewScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ id: string; athlete?: string; title?: string }>();
  const assignmentId = params.id;

  const perf = useQuery({
    queryKey: ['assignment', assignmentId, 'performance'],
    queryFn: async (): Promise<Performance> => {
      const response = await getPerformance(assignmentId);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const performanceId = perf.data?.id;
  const comments = useQuery({
    queryKey: ['performance', performanceId, 'comments'],
    enabled: !!performanceId,
    queryFn: async (): Promise<Comment[]> => {
      const response = await listComments({ performanceId });
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const [body, setBody] = useState('');

  const mutation = useMutation({
    mutationFn: async (): Promise<Comment> => {
      const response = await createComment({ performanceId, body: body.trim() });
      if (response.status === 201) return response.data;
      throw response;
    },
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: ['performance', performanceId, 'comments'] });
      void queryClient.invalidateQueries({ queryKey: COACH_DASHBOARD_QUERY_KEY });
      toast.show({ title: 'Feedback envoyé', variant: 'success' });
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
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <Pressable
        testID="review-back"
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
          {params.athlete && params.athlete.length > 0 ? params.athlete : 'Athlète'}
        </Text>
      </Pressable>

      <View style={{ gap: spacing[1] }}>
        <Text
          testID="review-title"
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          {params.title && params.title.length > 0 ? params.title : 'Revue de performance'}
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Relis la performance et laisse ton feedback.
        </Text>
      </View>

      {perf.isLoading ? (
        <View testID="review-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : perf.isError || !perf.data ? (
        <Card testID={isConsentRequired(perf.error) ? 'review-consent' : 'review-error'}>
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              {isConsentRequired(perf.error)
                ? "Cet athlète n'a pas autorisé l'accès à ses données (consentement requis)."
                : 'Impossible de charger cette performance.'}
            </Text>
            {!isConsentRequired(perf.error) ? (
              <Button testID="review-retry" onPress={() => void perf.refetch()}>
                Réessayer
              </Button>
            ) : null}
          </View>
        </Card>
      ) : (
        <>
          <PerformanceSummary performance={perf.data} />

          {/* Fil de feedback existant. */}
          <View style={{ gap: spacing[3] }}>
            <SectionTitle>Feedback</SectionTitle>
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
                testID="review-no-comments"
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Pas encore de feedback — sois le premier à commenter.
              </Text>
            )}
          </View>

          {/* Saisie du feedback. */}
          <View style={{ gap: spacing[3] }}>
            <TextInput
              testID="review-input"
              value={body}
              onChangeText={setBody}
              placeholder="Ton feedback à l'athlète…"
              placeholderTextColor={colors.textMuted}
              multiline
              style={{
                minHeight: 96,
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
              testID="review-send"
              onPress={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={!canSend}
              size="lg"
            >
              Envoyer le feedback
            </Button>
          </View>
        </>
      )}
    </ScrollView>
  );
}

/** Résumé lecture seule de la performance saisie par l'athlète (résultats, RPE, notes). */
function PerformanceSummary({ performance }: { performance: Performance }) {
  const { colors, typography, spacing } = useTheme();
  const items = performance.results?.items ?? [];
  return (
    <View style={{ gap: spacing[3] }}>
      <SectionTitle>Performance de l'athlète</SectionTitle>
      <Card>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Metric label="RPE" value={performance.rpe != null ? `${performance.rpe}/10` : '—'} />
            <Metric
              label="Exercices réalisés"
              value={`${items.filter((i) => i.setResults?.some((s) => s.completed)).length}/${items.length}`}
            />
          </View>
          {performance.notes ? (
            <View style={{ gap: spacing[1] }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Ressenti de l'athlète
              </Text>
              <Text
                testID="review-athlete-notes"
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                }}
              >
                {performance.notes}
              </Text>
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ flex: 1, gap: spacing[1] }}>
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h3.fontSize,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: colors.textMuted,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  const { colors, typography } = useTheme();
  return (
    <Text
      style={{
        color: colors.textSecondary,
        fontFamily: typography.fontFamily.medium,
        fontSize: typography.bodySm.fontSize,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
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
