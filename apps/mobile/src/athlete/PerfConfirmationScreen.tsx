import {
  confirmRecord,
  getAssignment,
  getPerformance,
  type Assignment,
  type Performance,
  type RecordCandidate,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { useToast } from '../feedback';
import { formatSessionDate, sessionTitle } from './athlete-session-ui';
import { sessionDetailHref } from './navigation';
import { formatMeasures, formatRecordValue } from './perf-entry';

/**
 * Écran Confirmation de perf (A-05 — TLX-078). Affiché après l'envoi de la saisie
 * (A-04) : confirme que la performance est partie chez le coach et récapitule ce qui a
 * été enregistré (mesures v2 par exercice, RPE, ressenti). Les deux requêtes sortent du
 * cache TanStack (préchauffé par l'écran de saisie) — pas d'appel réseau supplémentaire
 * dans le parcours nominal. États chargement / erreur.
 */
export function PerfConfirmationScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const assignment = useQuery({
    queryKey: ['assignment', id],
    queryFn: async (): Promise<Assignment> => {
      const response = await getAssignment(id);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const perf = useQuery({
    queryKey: ['assignment', id, 'performance'],
    queryFn: async (): Promise<Performance | null> => {
      const response = await getPerformance(id);
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
      {assignment.isLoading || perf.isLoading ? (
        <View testID="perf-confirmation-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : perf.isError || !perf.data ? (
        <Card testID="perf-confirmation-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de retrouver cette performance.
            </Text>
            <Button
              testID="perf-confirmation-back-sessions"
              onPress={() => router.replace('/(athlete)/sessions')}
            >
              Retour aux séances
            </Button>
          </View>
        </Card>
      ) : (
        <>
          {/* En-tête de célébration : la perf est partie chez le coach. */}
          <View style={{ alignItems: 'center', gap: spacing[3], paddingTop: spacing[6] }}>
            <View
              testID="perf-confirmation-icon"
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.successBg,
              }}
            >
              <Feather name="check" size={36} color={colors.success} />
            </View>
            <Text
              testID="perf-confirmation-title"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h2.fontSize,
                textAlign: 'center',
              }}
            >
              Performance envoyée !
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              {assignment.data ? `${sessionTitle(assignment.data)} — ` : ''}
              ton coach pourra la revoir et te laisser un feedback.
            </Text>
          </View>

          {perf.data.recordCandidates?.length ? (
            <RecordCandidatesCard performance={perf.data} />
          ) : null}

          <RecapCard performance={perf.data} />

          <View style={{ gap: spacing[3] }}>
            <Button
              testID="perf-confirmation-back-sessions"
              onPress={() => router.replace('/(athlete)/sessions')}
            >
              Retour aux séances
            </Button>
            <Button
              testID="perf-confirmation-view-session"
              variant="ghost"
              onPress={() => router.replace(sessionDetailHref(id))}
            >
              Revoir ma saisie
            </Button>
          </View>
        </>
      )}
    </ScrollView>
  );
}

/**
 * Proposition de mise à jour des records (TLX-076, ADR-20) : candidats détectés par le
 * backend à la soumission. L'athlète valide épreuve par épreuve — la valeur est
 * revalidée côté serveur depuis la performance (jamais de valeur libre).
 */
function RecordCandidatesCard({ performance }: { performance: Performance }) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const candidates = performance.recordCandidates ?? [];

  const mutation = useMutation({
    mutationFn: async (candidate: RecordCandidate) => {
      const response = await confirmRecord(candidate.eventKey, {
        performanceId: performance.id,
      });
      if (response.status === 200) return response.data;
      throw response;
    },
    onSuccess: (record) => {
      setConfirmed((prev) => [...prev, record.eventKey]);
      void queryClient.invalidateQueries({ queryKey: ['records'] });
      toast.show({ title: 'Record enregistré !', variant: 'success' });
    },
    onError: () => {
      toast.show({ title: "Échec de l'enregistrement du record", variant: 'danger' });
    },
  });

  return (
    <Card testID="record-candidates" style={{ backgroundColor: colors.accentSubtle }}>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Feather name="award" size={18} color={colors.accentText} />
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.body.fontSize,
            }}
          >
            {candidates.length > 1 ? 'Nouveaux records ?' : 'Nouveau record ?'}
          </Text>
        </View>
        {candidates.map((candidate) => {
          const done = confirmed.includes(candidate.eventKey);
          return (
            <View
              key={candidate.eventKey}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  testID={`record-candidate-${candidate.eventKey}`}
                  style={{
                    color: colors.textPrimary,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.body.fontSize,
                  }}
                >
                  {candidate.label} — {formatRecordValue(candidate.value, candidate.unit)}
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.bodySm.fontSize,
                  }}
                >
                  {candidate.previousValue != null
                    ? `Ancien record : ${formatRecordValue(candidate.previousValue, candidate.unit)}`
                    : 'Première marque sur cette épreuve'}
                </Text>
              </View>
              {done ? (
                <Text
                  testID={`record-confirmed-${candidate.eventKey}`}
                  style={{
                    color: colors.success,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.bodySm.fontSize,
                  }}
                >
                  ✓ Validé
                </Text>
              ) : (
                <Button
                  testID={`record-confirm-${candidate.eventKey}`}
                  size="sm"
                  loading={mutation.isPending}
                  onPress={() => mutation.mutate(candidate)}
                >
                  Valider
                </Button>
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/** Récapitulatif de ce qui vient d'être enregistré (mesures v2, RPE, ressenti). */
function RecapCard({ performance }: { performance: Performance }) {
  const { colors, typography, spacing } = useTheme();
  const items = performance.results?.items ?? [];
  const completedCount = items.filter((i) => i.setResults?.some((s) => s.completed)).length;
  return (
    <Card>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <Metric label="RPE" value={performance.rpe != null ? `${performance.rpe}/10` : '—'} />
          <Metric label="Exercices réalisés" value={`${completedCount}/${items.length}`} />
        </View>
        {performance.submittedAt ? (
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Enregistrée le {formatSessionDate(performance.submittedAt)}
          </Text>
        ) : null}
        {/* Mesures v2 (ADR-19) : mêmes libellés que la revue coach (C-08). */}
        {items.some((i) => formatMeasures(i.setResults)) ? (
          <View style={{ gap: spacing[1] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Tes mesures
            </Text>
            {items.map((item, idx) => {
              const measures = formatMeasures(item.setResults);
              if (!measures) return null;
              return (
                <Text
                  key={`${item.exerciseName}-${idx}`}
                  testID={`perf-confirmation-measures-${idx}`}
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
              Ton ressenti
            </Text>
            <Text
              testID="perf-confirmation-notes"
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
