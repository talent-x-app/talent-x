import {
  getAssignment,
  getPerformance,
  submitPerformance,
  updatePerformance,
  type Assignment,
  type Performance,
  type PerformanceCreate,
  type ResultsDoc,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button, Card, Chip, Slider } from '../components/ui';
import { useToast } from '../feedback';
import { FeedbackThread } from '../comments/FeedbackThread';
import { formatExerciseTarget } from '../sessions/exercise-target';
import { formatSessionDate, sessionTitle } from './athlete-session-ui';
import {
  entryFromResult,
  entryIsCompleted,
  entryToResult,
  makeEmptyEntry,
  type ExerciseEntry,
} from './perf-entry';

/** Réponse 403 dont le code métier indique un consentement manquant. */
function isConsentRequired(error: unknown): boolean {
  const e = error as { status?: number; data?: { error?: string } } | undefined;
  return e?.status === 403 && e?.data?.error === 'CONSENT_REQUIRED';
}

const DEFAULT_RPE = 7;

/** Version courante du contrat JSONB des résultats (schéma results v2, TX-DATA-006 · ADR-19). */
const RESULTS_SCHEMA_VERSION = 2;

/**
 * Écran Détail séance + saisie de perf (A-03/A-04 — TLX-065/071). Consomme
 * `GET /assignments/:id` (séance embarquée) et `GET /assignments/:id/performance`
 * (préremplissage si déjà saisie). L'athlète coche les exercices réalisés, règle son
 * RPE et ses notes, puis soumet via `POST` (ou `PUT` si déjà enregistrée). Idempotence :
 * en-tête `Idempotency-Key` dérivé de l'affectation. Porte de consentement `data_processing`
 * (403 → message dédié). États chargement / erreur.
 */
export function SessionDetailScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
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

  // Performance existante (préremplissage). 404 = pas encore saisie : on ne retente pas.
  const existing = useQuery({
    queryKey: ['assignment', id, 'performance'],
    queryFn: async (): Promise<Performance | null> => {
      const response = await getPerformance(id);
      if (response.status === 200) return response.data;
      if (response.status === 404) return null;
      throw response;
    },
    retry: false,
  });

  const exercises = useMemo(
    () => assignment.data?.session?.exercises?.items ?? [],
    [assignment.data],
  );

  // État de saisie local par exercice (mode dérivé du type de bloc — TLX-072/073/074),
  // dimensionné sur la cible (TLX-062) puis réhydraté depuis la perf existante.
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [rpe, setRpe] = useState(DEFAULT_RPE);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setEntries(exercises.map((ex) => makeEmptyEntry(ex)));
  }, [exercises]);

  useEffect(() => {
    const perf = existing.data;
    if (!perf) return;
    setEntries(
      exercises.map((ex) =>
        entryFromResult(
          ex,
          perf.results.items.find((r) => r.exerciseName === ex.name),
        ),
      ),
    );
    if (perf.rpe != null) setRpe(perf.rpe);
    if (perf.notes != null) setNotes(perf.notes);
  }, [existing.data, exercises]);

  function updateEntry(index: number, updater: (entry: ExerciseEntry) => ExerciseEntry) {
    setEntries((prev) => prev.map((e, i) => (i === index ? updater(e) : e)));
  }

  const alreadySaved = existing.data != null;

  const mutation = useMutation({
    mutationFn: async (): Promise<Performance> => {
      const results: ResultsDoc = {
        schemaVersion: RESULTS_SCHEMA_VERSION,
        items: exercises.map((ex, i) => entryToResult(ex, entries[i] ?? makeEmptyEntry(ex))),
      };
      const body: PerformanceCreate = { results, rpe, notes: notes.trim() || undefined };
      const response = alreadySaved
        ? await updatePerformance(id, body)
        : await submitPerformance(id, body, { headers: { 'Idempotency-Key': `perf-${id}` } });
      if (response.status === 200 || response.status === 201) return response.data;
      throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['assignment', id] });
      toast.show({
        title: alreadySaved ? 'Performance mise à jour' : 'Performance enregistrée',
        variant: 'success',
      });
      router.back();
    },
    onError: (error) => {
      toast.show({
        title: 'Échec de l’enregistrement',
        description: isConsentRequired(error)
          ? 'Active le consentement « traitement des données » pour enregistrer.'
          : 'Réessaie dans un instant.',
        variant: 'danger',
      });
    },
  });

  const completedCount = entries.filter(entryIsCompleted).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <Pressable
        testID="session-detail-back"
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

      {assignment.isLoading ? (
        <View testID="session-detail-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : assignment.isError || !assignment.data ? (
        <Card testID="session-detail-error">
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
            <Button testID="session-detail-retry" onPress={() => void assignment.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : (
        <>
          <View style={{ gap: spacing[2] }}>
            <Text
              testID="session-detail-title"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h2.fontSize,
              }}
            >
              {sessionTitle(assignment.data)}
            </Text>
            {assignment.data.session?.scheduledDate ? (
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {formatSessionDate(assignment.data.session.scheduledDate)}
              </Text>
            ) : null}
            {assignment.data.session?.description ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                }}
              >
                {assignment.data.session.description}
              </Text>
            ) : null}
          </View>

          {alreadySaved ? (
            <Card testID="session-detail-saved" style={{ backgroundColor: colors.successBg }}>
              <Text
                style={{
                  color: colors.success,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Performance déjà enregistrée
                {existing.data?.submittedAt
                  ? ` le ${formatSessionDate(existing.data.submittedAt)}`
                  : ''}
                . Tu peux la mettre à jour.
              </Text>
            </Card>
          ) : null}

          {/* A-03 : exercices de la séance, cochables (réalisé / non réalisé). */}
          <View style={{ gap: spacing[3] }}>
            <SectionTitle>
              Exercices · {completedCount}/{exercises.length}
            </SectionTitle>
            {exercises.length === 0 ? (
              <Card>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.body.fontSize,
                  }}
                >
                  Aucun exercice dans cette séance.
                </Text>
              </Card>
            ) : (
              <Card padded={false}>
                {exercises.map((ex, i) => {
                  const entry = entries[i];
                  if (entry && entry.mode !== 'checklist') {
                    // Modes mesurés (TLX-072/073/074) : temps par course / distance par essai.
                    return (
                      <View
                        key={`${ex.name}-${i}`}
                        testID={`exercise-${i}`}
                        style={[
                          styles.measuredBlock,
                          { borderTopColor: colors.border, borderTopWidth: i ? 1 : 0 },
                        ]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                          <Text
                            style={{
                              flex: 1,
                              color: colors.textPrimary,
                              fontFamily: typography.fontFamily.medium,
                              fontSize: typography.body.fontSize,
                            }}
                          >
                            {ex.name}
                          </Text>
                          <Text
                            testID={`exercise-${i}-target`}
                            style={{
                              color: colors.textMuted,
                              fontFamily: typography.fontFamily.regular,
                              fontSize: typography.bodySm.fontSize,
                            }}
                          >
                            {formatExerciseTarget(ex)}
                          </Text>
                        </View>
                        {entry.mode === 'time' ? (
                          <TimeEntryRows
                            index={i}
                            times={entry.times}
                            onChange={(times) => updateEntry(i, () => ({ mode: 'time', times }))}
                          />
                        ) : (
                          <DistanceEntryRows
                            index={i}
                            attempts={entry.attempts}
                            onChange={(attempts) =>
                              updateEntry(i, () => ({ mode: 'distance', attempts }))
                            }
                          />
                        )}
                      </View>
                    );
                  }
                  // Mode checklist (base v1) : réalisé / non réalisé.
                  const on = entry?.mode === 'checklist' && entry.done;
                  return (
                    <Pressable
                      key={`${ex.name}-${i}`}
                      testID={`exercise-${i}`}
                      onPress={() =>
                        updateEntry(i, (e) =>
                          e.mode === 'checklist' ? { mode: 'checklist', done: !e.done } : e,
                        )
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={[
                        styles.exerciseRow,
                        { borderTopColor: colors.border, borderTopWidth: i ? 1 : 0 },
                      ]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          on
                            ? { backgroundColor: colors.accent, borderColor: colors.accent }
                            : { borderColor: colors.borderStrong },
                        ]}
                      >
                        {on ? <Feather name="check" size={14} color={colors.accentText} /> : null}
                      </View>
                      <Text
                        style={{
                          flex: 1,
                          color: colors.textPrimary,
                          fontFamily: typography.fontFamily.medium,
                          fontSize: typography.body.fontSize,
                          textDecorationLine: on ? 'line-through' : 'none',
                          opacity: on ? 0.55 : 1,
                        }}
                      >
                        {ex.name}
                      </Text>
                      <Text
                        testID={`exercise-${i}-target`}
                        style={{
                          color: colors.textMuted,
                          fontFamily: typography.fontFamily.regular,
                          fontSize: typography.bodySm.fontSize,
                        }}
                      >
                        {formatExerciseTarget(ex)}
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            )}
          </View>

          {/* A-04 : champs communs de saisie — RPE + notes. */}
          <View style={{ gap: spacing[3] }}>
            <SectionTitle>Ressenti</SectionTitle>
            <Card>
              <View style={{ gap: spacing[3] }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    Effort perçu (RPE)
                  </Text>
                  <Text
                    testID="rpe-value"
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.bold,
                      fontSize: typography.body.fontSize,
                    }}
                  >
                    {rpe}/10
                  </Text>
                </View>
                <Slider
                  testID="rpe-slider"
                  value={rpe}
                  onValueChange={setRpe}
                  min={1}
                  max={10}
                  step={1}
                  accessibilityLabel="Effort perçu (RPE)"
                />
              </View>
            </Card>
            <TextInput
              testID="notes-input"
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (optionnel) — sensations, douleurs, conditions…"
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
          </View>

          <Button
            testID="submit-performance"
            onPress={() => mutation.mutate()}
            loading={mutation.isPending}
            size="lg"
          >
            {alreadySaved ? 'Mettre à jour' : 'Enregistrer ma perf'}
          </Button>

          {/* A-09 : fil de feedback avec le coach (une fois la perf enregistrée). */}
          {existing.data ? (
            <FeedbackThread
              performanceId={existing.data.id}
              composerPlaceholder="Répondre à ton coach…"
              sendLabel="Envoyer"
              emptyHint="Pas encore de retour de ton coach sur cette séance."
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/** Lignes de temps (mode Temps / Intervalles — TLX-072/073). Saisie « 7.45 » ou « 1:15.3 ». */
function TimeEntryRows({
  index,
  times,
  onChange,
}: {
  index: number;
  times: string[];
  onChange: (times: string[]) => void;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      {times.map((value, j) => (
        <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text
            style={{
              width: 56,
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            N° {j + 1}
          </Text>
          <TextInput
            testID={`exercise-${index}-time-${j}`}
            value={value}
            onChangeText={(v) => onChange(times.map((t, k) => (k === j ? v : t)))}
            placeholder="Temps (s) — ex. 7.45 ou 1:15.3"
            placeholderTextColor={colors.textMuted}
            keyboardType="numbers-and-punctuation"
            style={[
              styles.measureInput,
              {
                borderColor: colors.borderStrong,
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
              },
            ]}
          />
        </View>
      ))}
      <Button
        testID={`exercise-${index}-add-row`}
        variant="ghost"
        size="sm"
        onPress={() => onChange([...times, ''])}
      >
        + Ajouter un temps
      </Button>
    </View>
  );
}

/** Lignes d'essais (mode Essais distance — TLX-074) : distance (m) + essai mordu. */
function DistanceEntryRows({
  index,
  attempts,
  onChange,
}: {
  index: number;
  attempts: { distance: string; failed: boolean }[];
  onChange: (attempts: { distance: string; failed: boolean }[]) => void;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      {attempts.map((attempt, j) => (
        <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text
            style={{
              width: 56,
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Essai {j + 1}
          </Text>
          <TextInput
            testID={`exercise-${index}-distance-${j}`}
            value={attempt.distance}
            onChangeText={(v) =>
              onChange(attempts.map((a, k) => (k === j ? { ...a, distance: v } : a)))
            }
            placeholder="Distance (m) — ex. 6.42"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            editable={!attempt.failed}
            style={[
              styles.measureInput,
              {
                borderColor: colors.borderStrong,
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                opacity: attempt.failed ? 0.5 : 1,
              },
            ]}
          />
          <Chip
            testID={`exercise-${index}-failed-${j}`}
            selected={attempt.failed}
            onPress={() =>
              onChange(attempts.map((a, k) => (k === j ? { ...a, failed: !a.failed } : a)))
            }
          >
            Mordu
          </Chip>
        </View>
      ))}
      <Button
        testID={`exercise-${index}-add-row`}
        variant="ghost"
        size="sm"
        onPress={() => onChange([...attempts, { distance: '', failed: false }])}
      >
        + Ajouter un essai
      </Button>
    </View>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
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

const styles = StyleSheet.create({
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  measuredBlock: {
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  measureInput: {
    flex: 1,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
