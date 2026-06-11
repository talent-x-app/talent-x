import {
  getAssignment,
  getPerformance,
  submitPerformance,
  updatePerformance,
  type Assignment,
  type ExerciseGroup,
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
import {
  exerciseRenderRows,
  leafRounds,
  resultForLeaf,
  type ExerciseRenderRow,
} from '../sessions/exercises-doc';
import { formatSessionDate, sessionTitle } from './athlete-session-ui';
import { AthleteIntentBanner, BriefMetrics, SuccessStopCard } from './brief-ui';
import { perfConfirmationHref } from './navigation';
import {
  ATTEMPTS_PER_BAR,
  type BarAttempt,
  type BarRow,
  entryFromResult,
  entryIsCompleted,
  entryToResult,
  makeEmptyBar,
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
  // Lignes de rendu (en-têtes de groupe intercalés, ADR-27) + feuilles à plat. L'état de
  // saisie `entries` est indexé par `leafIndex` → aligné sur `leafRows`.
  const rows = useMemo(() => exerciseRenderRows(exercises), [exercises]);
  const leafRows = useMemo(
    () => rows.filter((r): r is Extract<ExerciseRenderRow, { type: 'leaf' }> => r.type === 'leaf'),
    [rows],
  );

  // État de saisie local par feuille (mode dérivé du type de bloc — TLX-072/073/074),
  // dimensionné sur la cible (TLX-062) ou les tours du groupe (ADR-27), puis réhydraté.
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [rpe, setRpe] = useState(DEFAULT_RPE);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setEntries(leafRows.map((r) => makeEmptyEntry(r.exercise, leafRounds(r.group))));
  }, [leafRows]);

  useEffect(() => {
    const perf = existing.data;
    if (!perf) return;
    setEntries(
      leafRows.map((r) =>
        entryFromResult(
          r.exercise,
          resultForLeaf(perf.results.items, r.exercise),
          leafRounds(r.group),
        ),
      ),
    );
    if (perf.rpe != null) setRpe(perf.rpe);
    if (perf.notes != null) setNotes(perf.notes);
  }, [existing.data, leafRows]);

  function updateEntry(index: number, updater: (entry: ExerciseEntry) => ExerciseEntry) {
    setEntries((prev) => prev.map((e, i) => (i === index ? updater(e) : e)));
  }

  const alreadySaved = existing.data != null;

  const mutation = useMutation({
    mutationFn: async (): Promise<Performance> => {
      const results: ResultsDoc = {
        schemaVersion: RESULTS_SCHEMA_VERSION,
        items: leafRows.map((r, i) =>
          entryToResult(r.exercise, entries[i] ?? makeEmptyEntry(r.exercise, leafRounds(r.group))),
        ),
      };
      const body: PerformanceCreate = { results, rpe, notes: notes.trim() || undefined };
      const response = alreadySaved
        ? await updatePerformance(id, body)
        : await submitPerformance(id, body, { headers: { 'Idempotency-Key': `perf-${id}` } });
      if (response.status === 200 || response.status === 201) return response.data;
      throw response;
    },
    onSuccess: (perf) => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['assignment', id] });
      // Préchauffe le cache de la confirmation (A-05) — pas d'appel réseau supplémentaire.
      queryClient.setQueryData(['assignment', id, 'performance'], perf);
      if (alreadySaved) {
        toast.show({ title: 'Performance mise à jour', variant: 'success' });
        router.back();
        return;
      }
      router.replace(perfConfirmationHref(id));
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

          {/* A-03 : en-tête éditorial (brief, ADR-28) — métriques + consigne « en une phrase ». */}
          <BriefMetrics brief={assignment.data.session?.brief} items={exercises} />
          {assignment.data.session?.brief?.athleteIntent ? (
            <AthleteIntentBanner text={assignment.data.session.brief.athleteIntent} />
          ) : null}

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

          {/* A-03 : exercices de la séance — groupes (ADR-27) + feuilles cochables/mesurées. */}
          <View style={{ gap: spacing[3] }}>
            <SectionTitle testID="exercise-count">
              Exercices · {completedCount}/{leafRows.length}
            </SectionTitle>
            {leafRows.length === 0 ? (
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
                {rows.map((row, ri) =>
                  row.type === 'group' ? (
                    <GroupHeader
                      key={row.key}
                      testID={row.key}
                      group={row.group}
                      divider={ri > 0}
                    />
                  ) : (
                    <LeafEntry
                      key={row.key}
                      row={row}
                      entry={entries[row.leafIndex]}
                      onChange={(updater) => updateEntry(row.leafIndex, updater)}
                      divider={ri > 0 && !row.firstInGroup}
                    />
                  ),
                )}
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

          {/* A-03 : garde-fous du brief (ADR-28) — « Réussi si / Stop si », au-dessus de la soumission. */}
          <SuccessStopCard
            successCriteria={assignment.data.session?.brief?.successCriteria}
            stopCriteria={assignment.data.session?.brief?.stopCriteria}
          />

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

/** En-tête d'un groupe d'exercices (ADR-27) : nom · N tours · R inter-tours. */
function GroupHeader({
  group,
  divider,
  testID,
}: {
  group: ExerciseGroup;
  divider: boolean;
  testID?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const rounds = group.rounds && group.rounds > 0 ? group.rounds : 1;
  const rest = group.restBetweenRoundsSeconds ? ` · R ${group.restBetweenRoundsSeconds}s` : '';
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: colors.surfaceSunken,
        borderTopColor: colors.border,
        borderTopWidth: divider ? 1 : 0,
      }}
    >
      <Feather name="repeat" size={14} color={colors.textMuted} />
      <Text
        style={{
          flex: 1,
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {group.name}
      </Text>
      <Text
        testID={testID ? `${testID}-rounds` : undefined}
        style={{
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {rounds} tours{rest}
      </Text>
    </View>
  );
}

/** Une feuille (exercice) : bloc mesuré (temps/distance/barres) ou checklist (1 ou N tours). */
function LeafEntry({
  row,
  entry,
  onChange,
  divider,
}: {
  row: Extract<ExerciseRenderRow, { type: 'leaf' }>;
  entry: ExerciseEntry | undefined;
  onChange: (updater: (entry: ExerciseEntry) => ExerciseEntry) => void;
  divider: boolean;
}) {
  const { colors, typography, spacing } = useTheme();
  const i = row.leafIndex;
  const ex = row.exercise;
  const superset = row.group?.groupType === 'superset';
  const name = superset && row.memberLabel ? `${row.memberLabel} · ${ex.name}` : ex.name;
  const paddingLeft = 14 + (row.group ? spacing[4] : 0);
  const topBorder = { borderTopColor: colors.border, borderTopWidth: divider ? 1 : 0 };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.body.fontSize,
        }}
      >
        {name}
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
  );

  if (entry && entry.mode !== 'checklist') {
    // Modes mesurés (TLX-072/073/074) : temps par course / distance par essai / grille de barres.
    return (
      <View testID={`exercise-${i}`} style={[styles.measuredBlock, topBorder, { paddingLeft }]}>
        {header}
        {entry.mode === 'time' ? (
          <TimeEntryRows
            index={i}
            times={entry.times}
            onChange={(times) => onChange(() => ({ mode: 'time', times }))}
          />
        ) : entry.mode === 'bars' ? (
          <BarsEntryGrid
            index={i}
            bars={entry.bars}
            onChange={(bars) => onChange(() => ({ mode: 'bars', bars }))}
          />
        ) : (
          <DistanceEntryRows
            index={i}
            attempts={entry.attempts}
            onChange={(attempts) => onChange(() => ({ mode: 'distance', attempts }))}
          />
        )}
      </View>
    );
  }

  const done = entry?.mode === 'checklist' ? entry.done : [false];

  // Membre de groupe checklist (ADR-27) : une case « Tour k » par tour.
  if (done.length > 1) {
    return (
      <View testID={`exercise-${i}`} style={[styles.measuredBlock, topBorder, { paddingLeft }]}>
        {header}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {done.map((d, k) => (
            <Pressable
              key={k}
              testID={`exercise-${i}-round-${k}`}
              onPress={() =>
                onChange((e) =>
                  e.mode === 'checklist'
                    ? { mode: 'checklist', done: e.done.map((v, kk) => (kk === k ? !v : v)) }
                    : e,
                )
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: d }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[1],
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: d ? colors.accent : colors.borderStrong,
                backgroundColor: d ? colors.accent : 'transparent',
              }}
            >
              <Text
                style={{
                  color: d ? colors.accentText : colors.textSecondary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Tour {k + 1}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // Un seul tour (base v1) : ligne cochable réalisé / non réalisé.
  const on = done[0] ?? false;
  return (
    <Pressable
      testID={`exercise-${i}`}
      onPress={() =>
        onChange((e) =>
          e.mode === 'checklist' ? { mode: 'checklist', done: [!(e.done[0] ?? false)] } : e,
        )
      }
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={[styles.exerciseRow, topBorder, { paddingLeft }]}
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
        {name}
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

/** Cycle d'une cellule d'essai au tap : non tenté → franchi → échec → non tenté. */
const BAR_ATTEMPT_CYCLE: Record<BarAttempt, BarAttempt> = {
  none: 'cleared',
  cleared: 'failed',
  failed: 'none',
};
const BAR_ATTEMPT_SYMBOL: Record<BarAttempt, string> = { none: '–', cleared: 'O', failed: 'X' };

/** Barre éliminatoire : 3 échecs et aucun franchissement (garde-fou d'UI, ADR-25). */
function barEliminated(bar: BarRow): boolean {
  return (
    !bar.attempts.includes('cleared') &&
    bar.attempts.filter((a) => a === 'failed').length >= ATTEMPTS_PER_BAR
  );
}

/**
 * Grille de barres (A-04 §4.4, TLX-075 / ADR-25) — saut en hauteur / perche : une ligne par
 * barre (hauteur en m), 3 essais cyclables (– non tenté / O franchi / X échec). La barre la plus
 * haute avec un « O » est la marque ; 3 « X » sans « O » signalent l'élimination (garde-fou).
 */
function BarsEntryGrid({
  index,
  bars,
  onChange,
}: {
  index: number;
  bars: BarRow[];
  onChange: (bars: BarRow[]) => void;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const setBar = (j: number, patch: Partial<BarRow>) =>
    onChange(bars.map((b, k) => (k === j ? { ...b, ...patch } : b)));
  const cycleAttempt = (j: number, m: number) =>
    setBar(j, {
      attempts: bars[j].attempts.map((a, k) => (k === m ? BAR_ATTEMPT_CYCLE[a] : a)),
    });
  return (
    <View style={{ gap: spacing[2] }}>
      <Text
        style={{
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        Touchez un essai pour cycler : – non tenté · O franchi · X échec
      </Text>
      {bars.map((bar, j) => {
        const eliminated = barEliminated(bar);
        return (
          <View
            key={j}
            testID={`exercise-${index}-bar-${j}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
          >
            <TextInput
              testID={`exercise-${index}-bar-${j}-height`}
              value={bar.height}
              onChangeText={(v) => setBar(j, { height: v })}
              placeholder="Barre (m) — ex. 1.85"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={[
                styles.measureInput,
                {
                  flex: 1,
                  borderColor: eliminated ? colors.danger : colors.borderStrong,
                  backgroundColor: colors.surface,
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: spacing[1] }}>
              {bar.attempts.map((a, m) => {
                const bg =
                  a === 'cleared'
                    ? colors.successBg
                    : a === 'failed'
                      ? colors.dangerBg
                      : colors.surfaceSunken;
                const fg =
                  a === 'cleared'
                    ? colors.success
                    : a === 'failed'
                      ? colors.danger
                      : colors.textMuted;
                return (
                  <Pressable
                    key={m}
                    testID={`exercise-${index}-bar-${j}-attempt-${m}`}
                    onPress={() => cycleAttempt(j, m)}
                    accessibilityRole="button"
                    accessibilityLabel={`Essai ${m + 1} : ${a}`}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: radius.sm,
                      borderWidth: borderWidth.hairline,
                      borderColor: a === 'none' ? colors.borderStrong : 'transparent',
                      backgroundColor: bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: fg,
                        fontFamily: typography.fontFamily.medium,
                        fontSize: typography.body.fontSize,
                      }}
                    >
                      {BAR_ATTEMPT_SYMBOL[a]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
      <Button
        testID={`exercise-${index}-add-bar`}
        variant="ghost"
        size="sm"
        onPress={() => onChange([...bars, makeEmptyBar()])}
      >
        + Ajouter une barre
      </Button>
    </View>
  );
}

function SectionTitle({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors, typography } = useTheme();
  return (
    <Text
      testID={testID}
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
