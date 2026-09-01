import {
  getAssignment,
  getPerformance,
  submitPerformance,
  updatePerformance,
  deleteTrainingLogSession,
  AssignmentStatus,
  SessionStatus,
  type Assignment,
  type Performance,
  type PerformanceCreate,
  type ResultsDoc,
  listMyRecords,
  type Exercise,
  type PersonalRecord,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { usePullToRefresh } from '../data/usePullToRefresh';
import { Button, Card, Chip, SegmentedTabs, Slider } from '../components/ui';
import { SkipSessionCard } from '../assignments/assignment-lifecycle';
import { useNetworkStatus, useToast } from '../feedback';
import {
  clearDraft,
  deviceStore,
  enqueuePerf,
  findOutboxItem,
  loadDraft,
  loadOutbox,
  saveDraft,
  type OutboxItem,
  type PerfDraft,
} from '../offline';
import { FeedbackThread } from '../comments/FeedbackThread';
import { formatExerciseTarget } from '../sessions/exercise-target';
import {
  formatTargetForView,
  hasPercentRecordTargets,
  type SessionView,
} from '../sessions/individualized-target';
import { MY_RECORDS_QUERY_KEY } from './records-query';
import {
  exerciseRenderRows,
  leafRounds,
  resultForLeaf,
  splitPhases,
  type ExerciseRenderRow,
} from '../sessions/exercises-doc';
import {
  GroupHeader,
  PhaseCard,
  SectionTitle,
  SessionContent,
} from '../sessions/session-content-ui';
import { formatSessionDate, SessionHero } from './athlete-session-ui';
import { sessionPhrase } from '../sessions/session-summary';
import { AttendanceSummaryView, PresenceControl, TeammatesKudosView } from '../groups/presence-ui';
import { AthleteIntentBanner, SessionStatStrip, SuccessStopCard } from './brief-ui';
import { perfConfirmationHref } from './navigation';
import { RecordCandidatesCard } from './record-candidates-ui';
import {
  attemptsPerBarOf,
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

/**
 * Distingue une **panne réseau** (la requête n'a pas abouti) d'une réponse HTTP d'erreur.
 * Le mutator `customFetch` renvoie une enveloppe `{ status }` pour toute réponse serveur et
 * **lève** seulement quand `fetch` rejette (hors ligne). Sans `status` numérique → réseau.
 */
function isNetworkError(error: unknown): boolean {
  return !(
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

/** Le brouillon porte une saisie réelle (≥ 1 exercice mesuré/coché ou des notes). */
function draftHasContent(draft: Pick<PerfDraft, 'entries' | 'notes'>): boolean {
  return draft.entries.some(entryIsCompleted) || draft.notes.trim() !== '';
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
  const online = useNetworkStatus();
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

  // Tirer-pour-rafraîchir (TLX-269) : le préfixe de l'affectation emporte performance, présence,
  // agrégat et kudos ; celui des performances emporte les fils de commentaires, qui sont indexés
  // par identifiant de **performance**. C'est ici qu'arrive le contenu produit par autrui, et
  // c'était le seul écran de l'app où le geste ne faisait rien.
  const refresh = usePullToRefresh([['assignment', id], ['performance']]);

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

  // TLX-161 : bascule Vue coach / Vue athlète — cibles « % record » individualisées à partir des
  // records personnels (dérivation de lecture pure, ADR-20/38). La bascule n'apparaît (et les
  // records ne sont chargés) que si au moins un exercice porte une intensité « % record ».
  const [view, setView] = useState<SessionView>('athlete');
  const showViewToggle = useMemo(
    () => hasPercentRecordTargets(leafRows.map((r) => r.exercise)),
    [leafRows],
  );
  const recordsQuery = useQuery({
    queryKey: MY_RECORDS_QUERY_KEY,
    enabled: showViewToggle,
    queryFn: async (): Promise<PersonalRecord[]> => {
      const response = await listMyRecords();
      if (response.status === 200) return response.data.items;
      throw response;
    },
    retry: false,
  });
  const records = recordsQuery.data ?? [];
  const targetFor = (ex: Exercise) => formatTargetForView(ex, view, records);
  // Phases (échauffement / RAC) : présentées en encart, hors saisie de perf (TLX-171).
  const phases = useMemo(() => splitPhases(exercises), [exercises]);

  // Mode d'affichage : **lecture seule par défaut** (consultation) ; l'athlète passe en
  // saisie via « Saisir ma performance » (A-04). La saisie n'est jamais imposée d'emblée.
  const [mode, setMode] = useState<'view' | 'entry'>('view');

  // État de saisie local par feuille (mode dérivé du type de bloc — TLX-072/073/074),
  // dimensionné sur la cible (TLX-062) ou les tours du groupe (ADR-27), puis réhydraté.
  const [entries, setEntries] = useState<ExerciseEntry[]>([]);
  const [rpe, setRpe] = useState(DEFAULT_RPE);
  const [notes, setNotes] = useState('');

  // Persistance hors-ligne (TLX-077) : brouillon auto-sauvegardé + écriture en attente.
  const [pendingDraft, setPendingDraft] = useState<PerfDraft | null>(null);
  const [queuedOffline, setQueuedOffline] = useState(false);

  // TLX-236, étendu par TLX-239 — les `useState` ci-dessus ne sont évalués QU'UNE FOIS.
  // `session/[id]` est un `Tabs.Screen … href: null` (écran d'onglet masqué, pas de pile) :
  // React Navigation le monte à la première visite et ne le démonte jamais. L'écran unique
  // sert donc toutes les séances, et changer d'`id` ne remonte rien : tout état qui décrit
  // la séance affichée doit être remis à zéro ici, à la main.
  //
  // Ajusté PENDANT le rendu plutôt que dans un `useEffect` : un effet s'exécute après la
  // peinture, la séance suivante s'ouvrirait donc sur un éclair de l'état précédent avant
  // de basculer. React ré-exécute ce composant immédiatement, sans afficher le rendu
  // intermédiaire.
  //
  // Ce qui est remis à zéro, et pourquoi :
  //  - `mode` (TLX-236) : passer en saisie sur une séance contaminait toutes les suivantes ;
  //  - `view` (TLX-161) : la bascule vue coach restait active d'une séance à l'autre ;
  //  - `rpe` / `notes` : leur seul effet de réhydratation sort tôt quand la séance suivante
  //    n'a pas encore de perf enregistrée — le formulaire s'ouvrait alors pré-rempli avec
  //    l'effort et les notes de la séance précédente.
  //
  // `entries` n'y figure pas : l'effet sur `[leafRows]` le redimensionne dès que la
  // nouvelle séance est chargée. `pendingDraft` et `queuedOffline` non plus : l'effet sur
  // `[id]` les réécrit systématiquement, y compris à `null` / `false`.
  const renderedId = useRef(id);
  if (renderedId.current !== id) {
    renderedId.current = id;
    setMode('view');
    setView('athlete');
    setRpe(DEFAULT_RPE);
    setNotes('');
  }

  useEffect(() => {
    setEntries(leafRows.map((r) => makeEmptyEntry(r.exercise, leafRounds(r.group))));
  }, [leafRows]);

  // Au montage : relit un éventuel brouillon local et signale une perf déjà en file (rouverte
  // après une saisie hors-ligne non encore synchronisée).
  useEffect(() => {
    if (!id) return;
    let active = true;
    void (async () => {
      const [draft, queue] = await Promise.all([
        loadDraft(deviceStore, id),
        loadOutbox(deviceStore),
      ]);
      if (!active) return;
      setPendingDraft(draft);
      setQueuedOffline(findOutboxItem(queue, id) != null);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  // Auto-sauvegarde du brouillon pendant la saisie (anti-perte sur app tuée / mauvais réseau),
  // débattue à 600 ms. Sans contenu réel → purge (on ne garde pas de brouillon vide).
  useEffect(() => {
    if (mode !== 'entry' || !id) return;
    const handle = setTimeout(() => {
      if (draftHasContent({ entries, notes })) {
        void saveDraft(deviceStore, id, { entries, rpe, notes, savedAt: new Date().toISOString() });
      } else {
        void clearDraft(deviceStore, id);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [mode, entries, rpe, notes, id]);

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

  // Passage en saisie : restaure le brouillon local s'il porte une saisie réelle et reste
  // **aligné** sur les feuilles courantes de la séance (garde-fou si la séance a changé).
  const startEntry = useCallback(() => {
    if (
      pendingDraft &&
      pendingDraft.entries.length === leafRows.length &&
      draftHasContent(pendingDraft)
    ) {
      setEntries(pendingDraft.entries);
      setRpe(pendingDraft.rpe);
      setNotes(pendingDraft.notes);
      toast.show({ title: 'Brouillon restauré', variant: 'info' });
    }
    setMode('entry');
  }, [pendingDraft, leafRows.length, toast]);

  const mutation = useMutation({
    mutationFn: async (): Promise<{ queued: true } | { perf: Performance }> => {
      const results: ResultsDoc = {
        schemaVersion: RESULTS_SCHEMA_VERSION,
        items: leafRows.map((r, i) =>
          entryToResult(r.exercise, entries[i] ?? makeEmptyEntry(r.exercise, leafRounds(r.group))),
        ),
      };
      const body: PerformanceCreate = { results, rpe, notes: notes.trim() || undefined };
      const queueItem: OutboxItem = {
        assignmentId: id,
        kind: alreadySaved ? 'update' : 'submit',
        body,
        idempotencyKey: `perf-${id}`,
        queuedAt: new Date().toISOString(),
      };
      // Hors ligne : on ne tente pas le réseau — l'écriture part en file (rejouée à la reconnexion).
      if (!online) {
        await enqueuePerf(deviceStore, queueItem);
        return { queued: true };
      }
      try {
        const response = alreadySaved
          ? await updatePerformance(id, body)
          : await submitPerformance(id, body, { headers: { 'Idempotency-Key': `perf-${id}` } });
        if (response.status === 200 || response.status === 201) return { perf: response.data };
        throw response;
      } catch (error) {
        // Panne réseau survenue en cours d'envoi → repli sur la file (pas un refus serveur).
        if (isNetworkError(error)) {
          await enqueuePerf(deviceStore, queueItem);
          return { queued: true };
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      if ('queued' in result) {
        // Mise en file : on conserve le brouillon (filet de sécurité jusqu'à confirmation du flush).
        setQueuedOffline(true);
        toast.show({
          title: 'Enregistré hors ligne',
          description: 'Ta perf sera synchronisée dès le retour du réseau.',
          variant: 'success',
        });
        setMode('view');
        return;
      }
      const perf = result.perf;
      setQueuedOffline(false);
      void clearDraft(deviceStore, id);
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['assignment', id] });
      // Préchauffe le cache de la confirmation (A-05) — pas d'appel réseau supplémentaire.
      // La promesse tient parce que `setQueryData` s'exécute APRÈS l'invalidation ci-dessus,
      // qui emporte cette clé par préfixe : l'écriture lève le drapeau d'invalidation et
      // remet la donnée à l'heure. L'écran de confirmation monte alors sur une entrée
      // fraîche et `refetchOnMount` ne part pas — **tant que `staleTime` est non nul**
      // (30 s dans `createQueryClient`). Sous un client à `staleTime: 0`, comme ceux des
      // tests, la requête repart : c'est une propriété de la configuration, pas du code
      // ci-dessus, et `query-client.test.ts` la vérifie sur le vrai client (TLX-240).
      queryClient.setQueryData(['assignment', id, 'performance'], perf);
      if (alreadySaved) {
        // Mise à jour : retour à la **lecture seule** (la perf relue, mesures incluses).
        toast.show({ title: 'Performance mise à jour', variant: 'success' });
        setMode('view');
        return;
      }
      // Retour en lecture AVANT de partir vers la confirmation : sans ça, l'écran (jamais
      // démonté) reste en saisie et la séance rouverte s'ouvre sur le formulaire — le fil
      // de feedback du coach, rendu dans la branche `view`, devient alors inatteignable
      // (TLX-236). C'était la seule des trois branches d'`onSuccess` à l'oublier, et
      // c'est celle que tout athlète emprunte la première fois.
      setMode('view');
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

  // Sous-titre du hero (TLX-219) : la « phrase » condensée de la séance (ADR-38) si elle se
  // dérive, sinon la description libre du coach.
  const sessionSubtitle = sessionPhrase(exercises) || assignment.data?.session?.description || '';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      refreshControl={
        <RefreshControl
          testID="session-detail-refresh"
          refreshing={refresh.refreshing}
          onRefresh={refresh.onRefresh}
          tintColor={colors.accent}
        />
      }
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
          <View style={{ gap: spacing[3] }}>
            <SessionHero assignment={assignment.data} />
            {sessionSubtitle ? (
              <Text
                testID="session-detail-subtitle"
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                }}
              >
                {sessionSubtitle}
              </Text>
            ) : null}
            <SessionStatStrip brief={assignment.data.session?.brief} items={exercises} />
          </View>

          {/* Présence (RSVP, ADR-43 §1) — déclarable tant que la séance est exécutable. La clé de
              cache passée aligne la mise à jour optimiste sur la requête de ce détail. */}
          {assignment.data.status !== AssignmentStatus.completed ? (
            <Card>
              <View style={{ gap: spacing[3] }}>
                <PresenceControl assignment={assignment.data} queryKey={['assignment', id]} />
                {/* Agrégat de présence du groupe (ADR-45) — compteur sans noms (RGPD). */}
                <AttendanceSummaryView assignmentId={id} />
                {/* Coéquipiers présents + kudos (ADR-48/49 Palier 2, AIPD §5.6) — nominatif. */}
                <TeammatesKudosView assignmentId={id} />
              </View>
            </Card>
          ) : null}

          {mode === 'view' ? (
            <>
              {/* TLX-077 : perf saisie hors ligne, en attente de synchronisation. */}
              {queuedOffline ? (
                <Card
                  testID="session-detail-pending-sync"
                  style={{ backgroundColor: colors.warningBg }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                    <Feather name="upload-cloud" size={16} color={colors.warning} />
                    <Text
                      style={{
                        flex: 1,
                        color: colors.warning,
                        fontFamily: typography.fontFamily.medium,
                        fontSize: typography.bodySm.fontSize,
                      }}
                    >
                      Enregistré hors ligne — en attente de synchronisation.
                    </Text>
                  </View>
                </Card>
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
                    Performance enregistrée
                    {existing.data?.submittedAt
                      ? ` le ${formatSessionDate(existing.data.submittedAt)}`
                      : ''}
                    .
                  </Text>
                </Card>
              ) : null}

              {/* TLX-243 — rattrapage des candidats record. Ils ne vivaient que sur l'écran de
                  confirmation (A-05), atteignable par le seul `router.replace` qui suit le
                  PREMIER enregistrement, et en `replace` : quitter sans valider rendait le
                  record définitivement inatteignable, alors que le serveur continue de le
                  proposer à chaque lecture de la performance. Ici la donnée est déjà chargée
                  (`existing`), il n'y a rien à reconstruire — et ce chemin couvre du même coup
                  la CORRECTION, dont la branche `onSuccess` ne navigue jamais vers A-05. */}
              {existing.data?.recordCandidates?.length ? (
                <RecordCandidatesCard
                  performance={existing.data}
                  testID="session-detail-record-candidates"
                  title={
                    existing.data.recordCandidates.length > 1
                      ? 'Records à valider'
                      : 'Record à valider'
                  }
                />
              ) : null}

              {/* A-03 : séance en lecture seule (exercices + Réussi/Stop) — mode par défaut. La
                  synthèse (hero + bandeau adaptatif) est rendue au-dessus → `showSummary={false}`. */}
              {showViewToggle ? (
                <SegmentedTabs
                  testID="session-view-toggle"
                  items={[
                    { key: 'athlete', label: 'Vue athlète' },
                    { key: 'coach', label: 'Vue coach' },
                  ]}
                  activeKey={view}
                  onChange={(k) => setView(k as SessionView)}
                />
              ) : null}
              <SessionContent
                exercises={exercises}
                brief={assignment.data.session?.brief}
                results={existing.data?.results?.items}
                showSummary={false}
                targetFor={targetFor}
              />

              {/* CTA principal (taille md, compact). Tant que la perf n'est pas saisie, il est
                  rendu côte à côte avec « Indisponible » (skip ADR-31/TLX-108) via le companion ;
                  une fois saisie, il occupe toute la largeur (le skip n'a plus de sens). */}
              {alreadySaved ? (
                <Button
                  testID="start-perf-entry"
                  onPress={startEntry}
                  fullWidth
                  leftIcon={<Feather name="edit-3" size={16} color={colors.textOnAccent} />}
                >
                  Modifier ma perf
                </Button>
              ) : (
                <SkipSessionCard
                  assignment={assignment.data}
                  companion={
                    <Button
                      testID="start-perf-entry"
                      onPress={startEntry}
                      fullWidth
                      leftIcon={<Feather name="edit-3" size={16} color={colors.textOnAccent} />}
                    >
                      Saisir ma perf
                    </Button>
                  }
                />
              )}

              {/* Échange avec le coach : une fois la perf enregistrée, fil de feedback sur la
                  perf (A-09) ; avant, discussion pré-séance sur la séance (TLX-118) — l'athlète
                  peut poser une question sur la séance à venir (cible = séance). */}
              {existing.data ? (
                <FeedbackThread
                  performanceId={existing.data.id}
                  composerPlaceholder="Répondre à ton coach…"
                  sendLabel="Envoyer"
                  emptyHint="Pas encore de retour de ton coach sur cette séance."
                />
              ) : (
                <FeedbackThread
                  sessionId={assignment.data.sessionId}
                  title="Discussion"
                  composerPlaceholder="Une question sur cette séance ?"
                  sendLabel="Envoyer"
                  emptyHint="Aucun message sur cette séance. Pose une question à ton coach."
                />
              )}
            </>
          ) : (
            <>
              {/* A-04 : la synthèse (hero + bandeau adaptatif) reste affichée au-dessus, hors mode ;
                  ici on ne répète que la consigne « en une phrase » du brief (ADR-28). */}
              {assignment.data.session?.brief?.athleteIntent ? (
                <AthleteIntentBanner text={assignment.data.session.brief.athleteIntent} />
              ) : null}

              {/* Échauffement (phase, hors saisie — TLX-171). */}
              {phases.warmup ? (
                <PhaseCard exercise={phases.warmup} icon="activity" testID="session-phase-warmup" />
              ) : null}

              {/* A-04 : exercices de la séance — groupes (ADR-27) + feuilles cochables/mesurées. */}
              <View style={{ gap: spacing[3] }}>
                <SectionTitle testID="exercise-count">
                  Exercices · {completedCount}/{leafRows.length}
                </SectionTitle>
                {leafRows.length === 0 ? (
                  <Card>
                    <Text
                      style={{
                        color: colors.textSecondary,
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
                          targetFor={targetFor}
                        />
                      ),
                    )}
                  </Card>
                )}
              </View>

              {/* Retour au calme (phase, hors saisie — TLX-171). */}
              {phases.cooldown ? (
                <PhaseCard exercise={phases.cooldown} icon="wind" testID="session-phase-cooldown" />
              ) : null}

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
                {!online
                  ? 'Enregistrer (hors ligne)'
                  : alreadySaved
                    ? 'Mettre à jour'
                    : 'Enregistrer ma perf'}
              </Button>

              <Button
                testID="cancel-perf-entry"
                onPress={() => setMode('view')}
                variant="ghost"
                disabled={mutation.isPending}
              >
                Annuler
              </Button>
            </>
          )}

          {/* Suppression d'une séance libre (TLX-253, ADR-36 §5 amendé §B4). `key` sur l'id de
              l'affectation : l'écran d'onglet n'est jamais démonté (ADR-58), et une confirmation
              restée armée viserait la séance suivante — c'est exactement TLX-245. */}
          {assignment.data.session?.status === SessionStatus.self_logged ? (
            <DeleteFreeSessionAction key={id} assignmentId={id} />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/**
 * Suppression d'une séance libre (TLX-253). L'athlète en est le propriétaire (ADR-36 §1) mais
 * n'avait aucun chemin : `DELETE /sessions/{id}` est coach-only, d'où le 403 sur le rôle mesuré
 * en QA-03.8. Confirmation **inline** (ADR-44 §6, comme quitter un groupe) plutôt qu'une
 * suppression immédiate — deux gestes destructifs du produit sont déjà mal cadrés (TLX-245/250).
 */
function DeleteFreeSessionAction({ assignmentId }: { assignmentId: string }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await deleteTrainingLogSession(assignmentId);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      // La séance quitte progression, records et assiduité : invalider les mêmes caches que
      // l'enregistrement (FreeSessionLog), sinon l'écran d'où l'on revient reste faux.
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: ['progress', 'me'] });
      void queryClient.invalidateQueries({ queryKey: MY_RECORDS_QUERY_KEY });
      toast.show({ variant: 'success', title: 'Séance libre supprimée' });
      router.back();
    },
    onError: () =>
      toast.show({
        variant: 'danger',
        title: 'Suppression impossible',
        description: 'Réessaie dans un instant.',
      }),
  });

  return (
    <Card testID="free-session-delete-card">
      {confirming ? (
        <View style={{ gap: spacing[3] }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Supprimer cette séance libre ? Elle disparaîtra de ta progression, de ton assiduité, et
            le record qui en vient sera retiré.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="free-session-delete-cancel"
                variant="secondary"
                fullWidth
                onPress={() => setConfirming(false)}
              >
                Annuler
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="free-session-delete-confirm"
                variant="danger"
                fullWidth
                loading={remove.isPending}
                onPress={() => remove.mutate()}
              >
                Supprimer
              </Button>
            </View>
          </View>
        </View>
      ) : (
        <Button
          testID="free-session-delete"
          variant="ghost"
          fullWidth
          onPress={() => setConfirming(true)}
        >
          Supprimer cette séance libre
        </Button>
      )}
    </Card>
  );
}

/** Une feuille (exercice) : bloc mesuré (temps/distance/barres) ou checklist (1 ou N tours). */
function LeafEntry({
  row,
  entry,
  onChange,
  divider,
  targetFor = formatExerciseTarget,
}: {
  row: Extract<ExerciseRenderRow, { type: 'leaf' }>;
  entry: ExerciseEntry | undefined;
  onChange: (updater: (entry: ExerciseEntry) => ExerciseEntry) => void;
  divider: boolean;
  /** Rendu de cible substituable — vue coach/athlète individualisée (TLX-161). */
  targetFor?: (ex: Exercise) => string;
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
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {targetFor(ex)}
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
            attemptsPerBar={attemptsPerBarOf(ex)}
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
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        {targetFor(ex)}
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
              color: colors.textSecondary,
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
              color: colors.textSecondary,
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

/**
 * Barre éliminatoire : tous les essais échoués, aucun franchissement (garde-fou d'UI, ADR-25).
 *
 * Le seuil suit la **longueur de la barre**, elle-même dimensionnée sur le réglage du coach
 * (TLX-223). Le comparer à une constante de 3 aurait laissé une barre de 2 essais ne jamais
 * s'éliminer, et une barre de 4 s'éliminer avec un essai encore libre.
 */
function barEliminated(bar: BarRow): boolean {
  return (
    bar.attempts.length > 0 &&
    !bar.attempts.includes('cleared') &&
    bar.attempts.every((a) => a === 'failed')
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
  attemptsPerBar,
  onChange,
}: {
  index: number;
  bars: BarRow[];
  /** Essais par barre du bloc (TLX-223) — dimensionne aussi les barres ajoutées à la main. */
  attemptsPerBar: number;
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
          color: colors.textSecondary,
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
        onPress={() => onChange([...bars, makeEmptyBar('', attemptsPerBar)])}
      >
        + Ajouter une barre
      </Button>
    </View>
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
