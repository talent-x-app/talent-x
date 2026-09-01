import {
  engageAthletes,
  getCoachDashboard,
  getCompetition,
  listEntries,
  unengageAthlete,
  type Competition,
  type CompetitionEntry,
  type Dashboard,
  type DashboardAthlete,
  type EngageRequest,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, InlineConfirm } from '../components/ui';
import { useToast } from '../feedback';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/dashboard-query';
import { AthleteStatusBadge, athleteFullName, athleteInitials } from './athlete-ui';
import {
  COMPETITIONS_QUERY_KEY,
  competitionEntriesQueryKey,
} from '../competitions/competitions-query';
import { coachCompetitionsHref } from '../competitions/navigation';

/**
 * Engagement d'athlètes à une compétition (TLX-101, ADR-24 — miroir de `CoachAssignScreen`).
 * Le coach choisit parmi ses athlètes liés (`GET /coach/dashboard`) ceux à engager, avec une
 * épreuve optionnelle commune (`eventLabel`, libre au MVP), puis envoie
 * `POST /competitions/:id/entries` (en-tête `Idempotency-Key` requis ; idempotence
 * structurelle via l'index unique partiel). Au succès, écran de confirmation. États :
 * chargement, erreur, vide (aucun athlète lié).
 */
export function CompetitionEngageScreen({ competitionId }: { competitionId: string }) {
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

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: async (): Promise<Competition> => {
      const response = await getCompetition(competitionId);
      if (response.status === 200) return response.data;
      throw response;
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [eventLabel, setEventLabel] = useState('');
  const [confirmedNames, setConfirmedNames] = useState<string[] | null>(null);

  const athletes = dashboard.data?.athletes ?? [];

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const athleteIds = [...selected];
      const body: EngageRequest = {
        athleteIds,
        eventLabel: eventLabel.trim() || undefined,
      };
      // Idempotence : clé stable dérivée de la compétition + sélection triée (l'effet idempotent
      // vient de l'index unique partiel côté backend ; l'en-tête est exigé par le contrat).
      const idempotencyKey = `engage-${competitionId}-${[...athleteIds].sort().join('-')}`;
      const response = await engageAthletes(competitionId, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      if (response.status !== 201) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPETITIONS_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: competitionEntriesQueryKey(competitionId),
      });
      const names = athletes.filter((a) => selected.has(a.id)).map((a) => athleteFullName(a));
      setConfirmedNames(names);
    },
    onError: () => {
      toast.show({ title: "Échec de l'engagement", variant: 'danger' });
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        testID="engage-back"
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

      {confirmedNames != null ? (
        <ConfirmationView
          competitionName={competition.data?.name}
          names={confirmedNames}
          // Cible explicite (pas `back()`, TLX-222) : cet écran est enchaîné après création
          // via `replace()` dans un navigateur d'onglets (routes masquées), dont l'historique
          // de « retour » ne pointe pas fiablement vers la liste. « Terminé » vise donc
          // directement la liste plutôt que de dépendre de l'historique de navigation.
          onDone={() => router.replace(coachCompetitionsHref())}
        />
      ) : (
        <>
          <View style={{ gap: spacing[2] }}>
            <Text
              testID="engage-title"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h1.fontSize,
                letterSpacing: -0.5,
              }}
            >
              Engager des athlètes
            </Text>
            {competition.data?.name ? (
              <Text
                testID="engage-competition-name"
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                }}
              >
                {competition.data.name}
              </Text>
            ) : null}
          </View>

          {dashboard.isLoading ? (
            <View testID="engage-loading" style={{ paddingVertical: spacing[6] }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : dashboard.isError || !dashboard.data ? (
            <Card testID="engage-error">
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
                <Button testID="engage-retry" onPress={() => void dashboard.refetch()}>
                  Réessayer
                </Button>
              </View>
            </Card>
          ) : athletes.length === 0 ? (
            <Card testID="engage-empty">
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                Aucun athlète lié pour l'instant. Partage un code de groupe pour qu'un athlète te
                rejoigne, puis reviens l'engager.
              </Text>
            </Card>
          ) : (
            <>
              {/* Épreuve optionnelle commune (libre au MVP, ADR-24). */}
              <View style={{ gap: spacing[2] }}>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.bodySm.fontSize,
                  }}
                >
                  Épreuve (optionnel)
                </Text>
                <TextInput
                  testID="engage-event-label"
                  value={eventLabel}
                  onChangeText={setEventLabel}
                  placeholder="Ex. 100m, Longueur…"
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

              {/* TLX-256 — « Déjà engagés » + désengagement. `unengageAthlete` existait au
                  contrat, était testée côté API et publiée dans le client généré, et **n'avait
                  aucun appelant** : un coach pouvait engager ses athlètes et ne plus jamais les
                  retirer. Un athlète blessé ou forfait restait engagé pour toujours. C'est une
                  correction de donnée devenue fausse, pas un confort — d'où sa place ici, dans
                  l'écran qui porte déjà l'engagement. */}
              <EngagedAthletes competitionId={competitionId} athletes={athletes} />

              {/* Sélection des athlètes. */}
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
                testID="engage-submit"
                size="lg"
                fullWidth
                disabled={selected.size === 0}
                loading={mutation.isPending}
                onPress={() => mutation.mutate()}
              >
                {selected.size > 0
                  ? `Engager ${selected.size} athlète${selected.size > 1 ? 's' : ''}`
                  : 'Sélectionne un athlète'}
              </Button>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** Ligne athlète sélectionnable (case + identité + badge de statut). */
/**
 * Section « Déjà engagés » + désengagement (TLX-256) — `DELETE /competitions/:id/entries/:entryId`.
 *
 * L'opération n'avait **aucun appelant** : un coach engageait ses athlètes et ne pouvait plus
 * jamais les retirer. C'est la plus gênante des quatre orphelines de ce ticket — archiver est un
 * confort, dupliquer un gain de temps, désengager corrige une donnée devenue fausse (blessure,
 * forfait).
 *
 * Confirmation inline, comme les autres gestes destructifs du dépôt (TLX-194/245/250) : le
 * cadrage vaut aussi pour ce qui n'est pas irréversible — réengager demande de refaire le geste.
 */
function EngagedAthletes({
  competitionId,
  athletes,
}: {
  competitionId: string;
  athletes: DashboardAthlete[];
}) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const entries = useQuery({
    queryKey: competitionEntriesQueryKey(competitionId),
    queryFn: async (): Promise<CompetitionEntry[]> => {
      const response = await listEntries(competitionId);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const removal = useMutation({
    mutationFn: async (entryId: string): Promise<void> => {
      const response = await unengageAthlete(competitionId, entryId);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: competitionEntriesQueryKey(competitionId) });
      void queryClient.invalidateQueries({ queryKey: COMPETITIONS_QUERY_KEY });
      setConfirmingId(null);
      toast.show({ variant: 'success', title: 'Athlète désengagé' });
    },
    onError: () => {
      toast.show({ variant: 'danger', title: 'Échec du désengagement' });
    },
  });

  const rows = entries.data ?? [];
  if (rows.length === 0) return null;

  /** Nom de l'athlète si le coach l'a encore dans ses liés ; repli neutre sinon. */
  const nameOf = (athleteId: string): string => {
    const athlete = athletes.find((a) => a.id === athleteId);
    return athlete ? athleteFullName(athlete) : 'Athlète';
  };

  return (
    <View testID="engage-engaged" style={{ gap: spacing[3] }}>
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Déjà engagés · {rows.length}
      </Text>
      <View style={{ gap: spacing[2] }}>
        {rows.map((entry) => (
          <Card key={entry.id} testID={`engage-engaged-${entry.id}`}>
            {confirmingId === entry.id ? (
              <InlineConfirm
                message={`Désengager ${nameOf(entry.athleteId)} de cette compétition ?`}
                confirmLabel="Désengager"
                confirmTestID={`engage-unengage-confirm-${entry.id}`}
                danger
                loading={removal.isPending}
                onConfirm={() => removal.mutate(entry.id)}
                onCancel={() => setConfirmingId(null)}
              />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.body.fontSize,
                    }}
                  >
                    {nameOf(entry.athleteId)}
                  </Text>
                  {entry.eventLabel?.trim() ? (
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontFamily: typography.fontFamily.regular,
                        fontSize: typography.bodySm.fontSize,
                      }}
                    >
                      {entry.eventLabel}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  testID={`engage-unengage-${entry.id}`}
                  onPress={() => setConfirmingId(entry.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Désengager ${nameOf(entry.athleteId)}`}
                  hitSlop={8}
                >
                  <Feather name="user-minus" size={20} color={colors.danger} />
                </Pressable>
              </View>
            )}
          </Card>
        ))}
      </View>
    </View>
  );
}

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
    <Card testID={`engage-athlete-${athlete.id}`} onPress={onPress}>
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

/** Écran de confirmation : récapitulatif des athlètes engagés + retour. */
function ConfirmationView({
  competitionName,
  names,
  onDone,
}: {
  competitionName?: string;
  names: string[];
  onDone: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const plural = names.length > 1 ? 's' : '';
  const summary = competitionName
    ? `${names.length} athlète${plural} engagé${plural} à « ${competitionName} ».`
    : `${names.length} athlète${plural} engagé${plural}.`;
  return (
    <View testID="engage-confirmation" style={{ gap: spacing[5] }}>
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
          Athlètes engagés
        </Text>
        <Text
          testID="engage-confirmation-summary"
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
          {names.map((name, i) => (
            <View
              key={`${name}-${i}`}
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
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Button testID="engage-done" size="lg" fullWidth onPress={onDone}>
        Terminé
      </Button>
    </View>
  );
}
