import {
  assignSession,
  getCoachDashboard,
  type AssignRequest,
  type Dashboard,
  type DashboardAthlete,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { useToast } from '../feedback';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/dashboard-query';
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');
  // Liste des noms affectés une fois l'assignation réussie → bascule en mode confirmation (C-07).
  const [confirmedNames, setConfirmedNames] = useState<string[] | null>(null);

  const athletes = dashboard.data?.athletes ?? [];

  const mutation = useMutation({
    mutationFn: async (): Promise<void> => {
      const athleteIds = [...selected];
      const body: AssignRequest = {
        athleteIds,
        dueDate: dueDate.trim() || undefined,
      };
      // Idempotence : clé stable dérivée de la séance + sélection triée (l'effet idempotent
      // vient de l'index unique partiel côté backend, l'en-tête est exigé par le contrat).
      const idempotencyKey = `assign-${sessionId}-${[...athleteIds].sort().join('-')}`;
      const response = await assignSession(sessionId, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      });
      if (response.status !== 201) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assignments'] });
      void queryClient.invalidateQueries({ queryKey: COACH_DASHBOARD_QUERY_KEY });
      const names = athletes.filter((a) => selected.has(a.id)).map((a) => athleteFullName(a));
      setConfirmedNames(names);
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      keyboardShouldPersistTaps="handled"
    >
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

      {confirmedNames != null ? (
        <ConfirmationView
          sessionTitle={sessionTitle}
          names={confirmedNames}
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
                disabled={selected.size === 0}
                loading={mutation.isPending}
                onPress={() => mutation.mutate()}
              >
                {selected.size > 0
                  ? `Assigner à ${selected.size} athlète${selected.size > 1 ? 's' : ''}`
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

/** Écran de confirmation (C-07) : récapitulatif des athlètes affectés + retour. */
function ConfirmationView({
  sessionTitle,
  names,
  onDone,
}: {
  sessionTitle?: string;
  names: string[];
  onDone: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const plural = names.length > 1 ? 's' : '';
  const summary = sessionTitle
    ? `« ${sessionTitle} » a été assignée à ${names.length} athlète${plural}.`
    : `Séance assignée à ${names.length} athlète${plural}.`;
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

      <Button testID="assign-done" size="lg" fullWidth onPress={onDone}>
        Terminé
      </Button>
    </View>
  );
}
