import {
  assignSession,
  getCoachDashboard,
  listGroups,
  type AssignRequest,
  type Dashboard,
  type DashboardAthlete,
  type Group,
  type GroupPage,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { ResponsiveContent } from '../responsive/ResponsiveContent';
import { useToast } from '../feedback';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/dashboard-query';
import { GROUPS_QUERY_KEY } from '../groups/groups-query';
import { weekdayLabel } from '../assignments/recurrence-label';
import { AthleteStatusBadge, athleteFullName, athleteInitials } from './athlete-ui';

/**
 * Assignation d'une séance (C-06) + Confirmation (C-07) — TLX-063. Le coach choisit parmi
 * ses athlètes liés (`GET /coach/dashboard`, cache partagé avec C-01) ceux à qui affecter la
 * séance, avec une échéance optionnelle, puis envoie `POST /sessions/:id/assign` (TLX-051,
 * en-tête `Idempotency-Key` requis). Au succès, bascule sur l'écran de **confirmation** (C-07)
 * récapitulant les athlètes affectés. États : chargement, erreur, vide (aucun athlète lié).
 */
export function CoachAssignScreen({
  sessionId,
  sessionTitle,
}: {
  sessionId: string;
  sessionTitle?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const dashboard = useQuery({
    queryKey: COACH_DASHBOARD_QUERY_KEY,
    queryFn: async (): Promise<Dashboard> => {
      const response = await getCoachDashboard();
      if (response.status === 200) return response.data;
      throw response;
    },
  });

  // Groupes du coach (ADR-30) — cache partagé avec les écrans Groupes (C-04).
  const groupsQuery = useQuery({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: async (): Promise<GroupPage> => {
      const response = await listGroups();
      if (response.status === 200) return response.data;
      throw response;
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');
  // Récurrence (ADR-35) : répéter chaque semaine jusqu'à `until`. Exige une échéance.
  const [repeat, setRepeat] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState('');
  // Récap d'affectation une fois réussie → bascule en mode confirmation (C-07).
  const [confirmed, setConfirmed] = useState<{
    athletes: number;
    occurrences: number;
    targets: string[];
  } | null>(null);

  const athletes = dashboard.data?.athletes ?? [];
  const groups = groupsQuery.data?.data ?? [];

  const dueWeekday = weekdayLabel(dueDate);
  // La répétition n'est proposée/envoyée que si l'échéance est une date valide (ADR-35).
  const canRepeat = dueWeekday != null;
  const recurrenceActive = canRepeat && repeat && repeatUntil.trim().length > 0;

  const mutation = useMutation({
    mutationFn: async (): Promise<{ athletes: number; occurrences: number }> => {
      const athleteIds = [...selected];
      const groupIds = [...selectedGroups];
      const body: AssignRequest = {
        athleteIds: athleteIds.length > 0 ? athleteIds : undefined,
        groupIds: groupIds.length > 0 ? groupIds : undefined,
        dueDate: dueDate.trim() || undefined,
        recurrence: recurrenceActive
          ? { frequency: 'weekly', until: repeatUntil.trim() }
          : undefined,
      };
      // Idempotence : clé stable dérivée de la séance + sélection triée (athlètes + groupes).
      const idempotencyKey = `assign-${sessionId}-${[...athleteIds, ...groupIds].sort().join('-')}`;
      const response = await assignSession(sessionId, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      if (response.status !== 201) throw response;
      // La réponse liste les affectations de toutes les occurrences (ADR-35) → on déduit
      // le nombre d'athlètes (uniques) et d'occurrences (séances distinctes).
      const rows = response.data.data;
      return {
        athletes: new Set(rows.map((r) => r.athleteId)).size,
        occurrences: new Set(rows.map((r) => r.sessionId)).size,
      };
    },
    onSuccess: ({ athletes: athleteCount, occurrences }) => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: COACH_DASHBOARD_QUERY_KEY });
      const groupTargets = groups
        .filter((g) => selectedGroups.has(g.id))
        .map((g) => `Groupe « ${g.name} »`);
      const athleteTargets = athletes
        .filter((a) => selected.has(a.id))
        .map((a) => athleteFullName(a));
      setConfirmed({
        athletes: athleteCount,
        occurrences,
        targets: [...groupTargets, ...athleteTargets],
      });
    },
    onError: () => {
      toast.show({ title: "Échec de l'assignation", variant: 'danger' });
    },
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(id: string) {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const totalSelected = selected.size + selectedGroups.size;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6] }}
      keyboardShouldPersistTaps="handled"
    >
      <ResponsiveContent testID="coach-responsive-content" style={{ gap: spacing[5] }}>
        <Pressable
          testID="assign-back"
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
            Retour
          </Text>
        </Pressable>

        {confirmed != null ? (
          <ConfirmationView
            sessionTitle={sessionTitle}
            count={confirmed.athletes}
            occurrences={confirmed.occurrences}
            targets={confirmed.targets}
            onDone={() => router.back()}
          />
        ) : (
          <>
            <View style={{ gap: spacing[2] }}>
              <Text
                testID="assign-title"
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.bold,
                  fontSize: typography.h1.fontSize,
                  letterSpacing: -0.5,
                }}
              >
                Assigner la séance
              </Text>
              {sessionTitle ? (
                <Text
                  testID="assign-session-title"
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.body.fontSize,
                  }}
                >
                  {sessionTitle}
                </Text>
              ) : null}
            </View>

            {dashboard.isLoading ? (
              <View testID="assign-loading" style={{ paddingVertical: spacing[6] }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : dashboard.isError || !dashboard.data ? (
              <Card testID="assign-error">
                <View style={{ gap: spacing[4] }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.body.fontSize,
                      textAlign: 'center',
                    }}
                  >
                    Impossible de charger tes athlètes.
                  </Text>
                  <Button testID="assign-retry" onPress={() => void dashboard.refetch()}>
                    Réessayer
                  </Button>
                </View>
              </Card>
            ) : athletes.length === 0 ? (
              <Card testID="assign-empty">
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.body.fontSize,
                    textAlign: 'center',
                  }}
                >
                  Aucun athlète lié pour l'instant. Partage un code de groupe pour qu'un athlète te
                  rejoigne, puis reviens assigner cette séance.
                </Text>
              </Card>
            ) : (
              <>
                {/* Échéance optionnelle de l'affectation. */}
                <View style={{ gap: spacing[2] }}>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    Échéance (optionnel)
                  </Text>
                  <TextInput
                    testID="assign-due-date"
                    value={dueDate}
                    onChangeText={setDueDate}
                    placeholder="AAAA-MM-JJ"
                    placeholderTextColor={colors.textMuted}
                    style={{
                      height: 48,
                      paddingHorizontal: spacing[4],
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.borderStrong,
                      backgroundColor: colors.surface,
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.body.fontSize,
                    }}
                  />
                </View>

                {/* Récurrence (ADR-35) — « répéter chaque <jour> jusqu'au <date> ».
                    Disponible seulement avec une échéance valide (qui fixe le jour). */}
                {canRepeat ? (
                  <View style={{ gap: spacing[2] }}>
                    <Pressable
                      testID="assign-repeat-toggle"
                      onPress={() => setRepeat((v) => !v)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: repeat }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
                    >
                      <View
                        style={[
                          {
                            width: 24,
                            height: 24,
                            borderRadius: 7,
                            borderWidth: 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                          },
                          repeat
                            ? { backgroundColor: colors.accent, borderColor: colors.accent }
                            : { borderColor: colors.borderStrong },
                        ]}
                      >
                        {repeat ? (
                          <Feather name="check" size={15} color={colors.accentText} />
                        ) : null}
                      </View>
                      <Text
                        style={{
                          flex: 1,
                          color: colors.textPrimary,
                          fontFamily: typography.fontFamily.medium,
                          fontSize: typography.body.fontSize,
                        }}
                      >
                        Répéter chaque {dueWeekday}
                      </Text>
                    </Pressable>

                    {repeat ? (
                      <View style={{ gap: spacing[2], paddingLeft: spacing[8] }}>
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontFamily: typography.fontFamily.regular,
                            fontSize: typography.bodySm.fontSize,
                          }}
                        >
                          Jusqu'au (inclus)
                        </Text>
                        <TextInput
                          testID="assign-repeat-until"
                          value={repeatUntil}
                          onChangeText={setRepeatUntil}
                          placeholder="AAAA-MM-JJ"
                          placeholderTextColor={colors.textMuted}
                          style={{
                            height: 48,
                            paddingHorizontal: spacing[4],
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.borderStrong,
                            backgroundColor: colors.surface,
                            color: colors.textPrimary,
                            fontFamily: typography.fontFamily.regular,
                            fontSize: typography.body.fontSize,
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Sélection par groupe (ADR-30) — tout le groupe en un geste. */}
                {groups.length > 0 ? (
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
                      Groupes · {selectedGroups.size}/{groups.length}
                    </Text>
                    <View style={{ gap: spacing[2] }}>
                      {groups.map((group) => (
                        <SelectableGroup
                          key={group.id}
                          group={group}
                          selected={selectedGroups.has(group.id)}
                          onPress={() => toggleGroup(group.id)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}

                {/* Sélection des athlètes (C-06). */}
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
                    Athlètes · {selected.size}/{athletes.length}
                  </Text>
                  <View style={{ gap: spacing[2] }}>
                    {athletes.map((athlete) => (
                      <SelectableAthlete
                        key={athlete.id}
                        athlete={athlete}
                        selected={selected.has(athlete.id)}
                        onPress={() => toggle(athlete.id)}
                      />
                    ))}
                  </View>
                </View>

                <Button
                  testID="assign-submit"
                  size="lg"
                  fullWidth
                  disabled={totalSelected === 0}
                  loading={mutation.isPending}
                  onPress={() => mutation.mutate()}
                >
                  {totalSelected > 0
                    ? `Assigner (${totalSelected} cible${totalSelected > 1 ? 's' : ''})`
                    : 'Sélectionne un groupe ou un athlète'}
                </Button>
              </>
            )}
          </>
        )}
      </ResponsiveContent>
    </ScrollView>
  );
}

/** Ligne athlète sélectionnable (case + identité + badge de statut). */
function SelectableAthlete({
  athlete,
  selected,
  onPress,
}: {
  athlete: DashboardAthlete;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, typography } = useTheme();
  return (
    <Card testID={`assign-athlete-${athlete.id}`} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={[
            {
              width: 24,
              height: 24,
              borderRadius: 7,
              borderWidth: 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
            selected
              ? { backgroundColor: colors.accent, borderColor: colors.accent }
              : { borderColor: colors.borderStrong },
          ]}
        >
          {selected ? <Feather name="check" size={15} color={colors.accentText} /> : null}
        </View>
        <View
          style={[
            {
              width: 40,
              height: 40,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accentSubtle,
            },
          ]}
        >
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {athleteInitials(athlete)}
          </Text>
        </View>
        <Text
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          {athleteFullName(athlete)}
        </Text>
        <AthleteStatusBadge status={athlete.status} />
      </View>
    </Card>
  );
}

/** Carte groupe sélectionnable (case + nom + effectif). */
function SelectableGroup({
  group,
  selected,
  onPress,
}: {
  group: Group;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, typography } = useTheme();
  const count = group.memberCount ?? 0;
  return (
    <Card testID={`assign-group-${group.id}`} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={[
            {
              width: 24,
              height: 24,
              borderRadius: 7,
              borderWidth: 2,
              alignItems: 'center',
              justifyContent: 'center',
            },
            selected
              ? { backgroundColor: colors.accent, borderColor: colors.accent }
              : { borderColor: colors.borderStrong },
          ]}
        >
          {selected ? <Feather name="check" size={15} color={colors.accentText} /> : null}
        </View>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentSubtle,
          }}
        >
          <Feather name="users" size={18} color={colors.accentText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {group.name}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {count} membre{count > 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** Écran de confirmation (C-07) : récapitulatif des cibles affectées + retour. */
function ConfirmationView({
  sessionTitle,
  count,
  occurrences,
  targets,
  onDone,
}: {
  sessionTitle?: string;
  count: number;
  occurrences: number;
  targets: string[];
  onDone: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const plural = count > 1 ? 's' : '';
  const base = sessionTitle
    ? `« ${sessionTitle} » a été assignée à ${count} athlète${plural}`
    : `Séance assignée à ${count} athlète${plural}`;
  // Récurrence (ADR-35) : préciser le nombre d'occurrences quand la séance est répétée.
  const summary = occurrences > 1 ? `${base}, répétée ${occurrences} fois.` : `${base}.`;
  return (
    <View testID="assign-confirmation" style={{ gap: spacing[5] }}>
      <View style={{ alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4] }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.successBg,
          }}
        >
          <Feather name="check" size={32} color={colors.success} />
        </View>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
            textAlign: 'center',
          }}
        >
          Séance assignée
        </Text>
        <Text
          testID="assign-confirmation-summary"
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
            textAlign: 'center',
          }}
        >
          {summary}
        </Text>
      </View>

      <Card>
        <View style={{ gap: spacing[3] }}>
          {targets.map((target, i) => (
            <View
              key={`${target}-${i}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
            >
              <Feather name="user-check" size={16} color={colors.success} />
              <Text
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.body.fontSize,
                }}
              >
                {target}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Button testID="assign-done" size="lg" fullWidth onPress={onDone}>
        Terminé
      </Button>
    </View>
  );
}
