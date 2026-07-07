import {
  BlockType,
  deleteSession,
  getCoachDashboard,
  getSession,
  listAssignments,
  type Session,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, InlineConfirm } from '../components/ui';
import { useToast } from '../feedback';
import { SESSION_STATUS_META } from '../calendar/calendar-model';
import { AssignmentStatusBadge, formatSessionDate } from '../athlete/athlete-session-ui';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/dashboard-query';
import { athleteFullName } from './athlete-ui';
import { SessionContent } from '../sessions/session-content-ui';
import { countLeaves } from '../sessions/exercises-doc';
import { FeedbackThread } from '../comments/FeedbackThread';
import { CoachBriefReview } from './brief-editor';
import { assignSessionHref, editSessionHref } from './navigation';
import { inferDiscipline, segmentSession, type Segment } from './discipline-inference';
import { disciplineConfig } from './discipline-assistants';
import { isEditableGroup, nodesFromExercises, nodesToItems } from './session-builder-ui';

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
    // Cet écran gère l'échec de chargement via sa carte d'erreur (et après suppression, un
    // refetch 404 est attendu) → pas de toast global « Séance introuvable » redondant.
    meta: { skipGlobalErrorToast: true },
  });

  const statusMeta = session.data ? SESSION_STATUS_META[session.data.status] : undefined;
  const exercises = session.data?.exercises?.items ?? [];

  // ADR-40 §3 : même inférence que le constructeur (édition), en lecture seule — un résumé
  // compatible avec la carte dédiée s'affiche si la discipline est reconnue, sans rendre le
  // canvas éditable (ce résumé ne fait que compléter `SessionContent`, repli identique sinon).
  const inferredDiscipline = useMemo(
    () => inferDiscipline(nodesFromExercises(exercises)),
    [exercises],
  );
  const disciplineSummary = useMemo(() => {
    if (inferredDiscipline == null) return null;
    const cfg = disciplineConfig(inferredDiscipline);
    if (!cfg) return null;
    const count = countLeaves(exercises);
    return `${cfg.label} — ${count} ${cfg.effortLabel.toLowerCase()}${count > 1 ? 's' : ''}`;
  }, [inferredDiscipline, exercises]);

  // ADR-42 §4 : une séance « Personnalisé » composite (mélange de disciplines / blocs libres)
  // n'a pas de discipline unique inférable — `disciplineSummary` est alors `null`. On affiche à
  // la place un récap **par bloc** (même segmentation que `CompositeCanvas`), pour ne pas
  // retomber sur la liste plate brute (repli jugé peu lisible).
  const blocks: Segment[] = useMemo(() => {
    if (inferredDiscipline != null) return [];
    const nodes = nodesFromExercises(exercises);
    const series = nodes.filter(
      (n) => isEditableGroup(n) || (n.type !== BlockType.warmup && n.type !== BlockType.cooldown),
    );
    const segments = segmentSession(series);
    return segments.length > 1 ? segments : [];
  }, [inferredDiscipline, exercises]);

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
                  color: colors.textSecondary,
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
            {disciplineSummary != null ? (
              <Text
                testID="coach-session-discipline-summary"
                style={{
                  color: colors.accentText,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {disciplineSummary}
              </Text>
            ) : null}
          </View>

          {blocks.length > 0 ? <SessionBlocksSummary blocks={blocks} /> : null}

          {/* Lecture coach du brief (ADR-28) : intention + notes internes (régression/progression/prudence). */}
          <CoachBriefReview brief={session.data.brief} />

          {/* Contenu partagé : brief athlète + exercices (groupes ADR-27) + Réussi/Stop. */}
          <SessionContent exercises={exercises} brief={session.data.brief} />

          {/* Visibilité a posteriori des affectations (TLX-193) : qui a cette séance + statut. */}
          <AssignedAthletes sessionId={id} />

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
            onPress={() =>
              router.push(
                assignSessionHref(id, session.data.title, false, session.data.scheduledDate),
              )
            }
            variant="secondary"
            leftIcon={<Feather name="user-plus" size={18} color={colors.textPrimary} />}
          >
            Assigner à des athlètes
          </Button>

          {/* TLX-194 : suppression (soft-delete) avec confirmation inline. */}
          <DeleteSessionAction sessionId={id} title={session.data.title} />

          {/* TLX-118 : discussion de séance — le coach répond aux questions des athlètes
              affectés (cible = séance, même fil que côté athlète). */}
          <FeedbackThread
            sessionId={id}
            title="Discussion"
            composerPlaceholder="Répondre aux athlètes…"
            sendLabel="Envoyer"
            emptyHint="Aucun message sur cette séance pour l'instant."
          />
        </>
      )}
    </ScrollView>
  );
}

/**
 * Action « Supprimer la séance » (TLX-194) — soft-delete `DELETE /sessions/:id` (204) derrière une
 * confirmation inline (robuste web + natif, même patron que la zone danger des groupes). Au succès :
 * invalide les listes (séances, cette séance, affectations) et revient à l'écran précédent.
 */
function DeleteSessionAction({ sessionId, title }: { sessionId: string; title: string }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const removal = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await deleteSession(sessionId);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      // La séance est supprimée : on **retire** sa query du cache (pas d'invalidate, qui
      // déclencherait un refetch 404). L'opt-out `meta` couvre tout refetch résiduel.
      queryClient.removeQueries({ queryKey: ['session', sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      toast.show({ variant: 'success', title: 'Séance supprimée' });
      router.back();
    },
    onError: () => {
      toast.show({ variant: 'danger', title: 'Échec de la suppression' });
    },
  });

  if (confirming) {
    return (
      <InlineConfirm
        message={`Supprimer « ${title} » ? Action irréversible.`}
        confirmLabel="Supprimer définitivement"
        confirmTestID="coach-session-delete-confirm"
        danger
        loading={removal.isPending}
        onConfirm={() => removal.mutate()}
        onCancel={() => setConfirming(false)}
      />
    );
  }
  return (
    <Button testID="coach-session-delete" variant="danger" onPress={() => setConfirming(true)}>
      Supprimer la séance
    </Button>
  );
}

/**
 * Section « Assigné à » (TLX-193) : liste les athlètes affectés à cette séance + leur statut
 * d'affectation. Les affectations (`listAssignments({ sessionId })`, scope coach) ne portent que
 * `athleteId` (pas l'identité) — on joint les **noms** via le dashboard coach (déjà en cache,
 * même source que l'écran d'assignation). Récurrence : chaque occurrence est une séance distincte
 * (ADR-35) → cette section ne montre que les affectations de **cette** séance.
 */
function AssignedAthletes({ sessionId }: { sessionId: string }) {
  const { colors, typography, spacing } = useTheme();
  const assignments = useQuery({
    queryKey: ['assignments', { sessionId }],
    queryFn: async () => {
      const res = await listAssignments({ sessionId });
      if (res.status === 200) return res.data;
      throw res;
    },
  });
  // Noms des athlètes liés (l'affectation ne porte que l'id) — réutilise le cache du dashboard.
  const dashboard = useQuery({
    queryKey: COACH_DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      const res = await getCoachDashboard();
      if (res.status === 200) return res.data;
      throw res;
    },
  });

  const rows = assignments.data?.data ?? [];
  const namesById = new Map(
    (dashboard.data?.athletes ?? []).map((a) => [a.id, athleteFullName(a)]),
  );

  const sectionTitle = (
    <Text
      style={{
        color: colors.textSecondary,
        fontFamily: typography.fontFamily.medium,
        fontSize: typography.bodySm.fontSize,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      Assigné à{rows.length > 0 ? ` · ${rows.length}` : ''}
    </Text>
  );

  if (assignments.isLoading) {
    return (
      <View testID="coach-session-assignees-loading" style={{ gap: spacing[2] }}>
        {sectionTitle}
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View testID="coach-session-assignees" style={{ gap: spacing[2] }}>
      {sectionTitle}
      {rows.length === 0 ? (
        <Text
          testID="coach-session-assignees-empty"
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Pas encore assignée à un athlète.
        </Text>
      ) : (
        <Card>
          <View style={{ gap: spacing[3] }}>
            {rows.map((a) => (
              <View
                key={a.id}
                testID={`coach-session-assignee-${a.athleteId}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
              >
                <Text
                  style={{
                    flex: 1,
                    color: colors.textPrimary,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.body.fontSize,
                  }}
                >
                  {namesById.get(a.athleteId) ?? 'Athlète'}
                </Text>
                <AssignmentStatusBadge status={a.status} />
              </View>
            ))}
          </View>
        </Card>
      )}
    </View>
  );
}

/** Titre/icône d'un segment : config discipline, ou repli « Personnalisé ». */
function blockMeta(segment: Segment): { label: string; icon: keyof typeof Feather.glyphMap } {
  if (segment.kind === 'discipline') {
    const cfg = disciplineConfig(segment.discipline);
    return { label: cfg?.label ?? segment.discipline, icon: cfg?.icon ?? 'box' };
  }
  return { label: 'Personnalisé', icon: 'edit-3' };
}

/**
 * Récap **par bloc** d'une séance composite (ADR-42 §4) : une rangée par segment, icône +
 * libellé de discipline + nombre d'exercices — pour donner d'un coup d'œil la structure de la
 * séance (échauffement/blocs/retour au calme) au lieu d'une liste plate indifférenciée.
 */
function SessionBlocksSummary({ blocks }: { blocks: Segment[] }) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
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
        {blocks.length} blocs
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        {blocks.map((seg, i) => {
          const { label, icon } = blockMeta(seg);
          const count = countLeaves(nodesToItems(seg.nodes));
          return (
            <View
              key={`${seg.kind}-${seg.start}`}
              testID={`coach-session-bloc-${i}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[2],
                paddingVertical: spacing[2],
                paddingHorizontal: spacing[3],
                borderRadius: radius.pill,
                borderWidth: borderWidth.hairline,
                borderColor: colors.borderStrong,
                backgroundColor: colors.surfaceSunken,
              }}
            >
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  backgroundColor: colors.accentSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name={icon} size={13} color={colors.accentText} />
              </View>
              <Text
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {label}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.caption.fontSize,
                }}
              >
                · {count}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
