import { getPerformance, type Performance } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { FeedbackThread } from '../comments/FeedbackThread';
import { formatMeasures } from '../athlete/perf-entry';

/** Réponse 403 dont le code métier indique un consentement manquant. */
function isConsentRequired(error: unknown): boolean {
  const e = error as { status?: number; data?: { error?: string } } | undefined;
  return e?.status === 403 && e?.data?.error === 'CONSENT_REQUIRED';
}

/**
 * Écran Revue de performance + feedback (C-08 — TLX-086). Le coach lit la performance
 * d'un athlète (`GET /assignments/:id/performance`, consent-gated) puis échange via le
 * fil de feedback partagé (`FeedbackThread`). Poster un commentaire coach sort la
 * performance de « à revoir » (dérivation tableau de bord). États chargement /
 * consentement / erreur.
 */
export function CoachReviewScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
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
          <FeedbackThread
            performanceId={perf.data.id}
            composerPlaceholder="Ton feedback à l'athlète…"
            sendLabel="Envoyer le feedback"
            emptyHint="Pas encore de feedback — sois le premier à commenter."
          />
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
          {/* Mesures v2 (ADR-19) : temps / distances par exercice, quand présentes. */}
          {items.some((i) => formatMeasures(i.setResults)) ? (
            <View style={{ gap: spacing[1] }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Mesures
              </Text>
              {items.map((item, idx) => {
                const measures = formatMeasures(item.setResults);
                if (!measures) return null;
                return (
                  <Text
                    key={`${item.exerciseName}-${idx}`}
                    testID={`review-measures-${idx}`}
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.body.fontSize,
                    }}
                  >
                    {item.exerciseName} — {measures}
                  </Text>
                );
              })}
            </View>
          ) : null}
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
