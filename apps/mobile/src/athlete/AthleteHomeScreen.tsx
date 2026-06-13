import {
  getMe,
  getMyGroups,
  listAssignments,
  type AthleteGroup,
  type Assignment,
  type User,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { MY_GROUPS_QUERY_KEY } from '../groups/groups-query';
import { joinGroupHref } from '../groups/navigation';
import { AssignmentListItem } from './athlete-session-ui';
import { sessionDetailHref } from './navigation';
import { countDueToday, selectPendingAssignments } from './home-model';
import { computeAttendance } from './attendance';
import { StreakBadge } from './AttendanceSection';
import { NotificationsBell } from '../notifications/NotificationsBell';

/** Clé du profil courant — même chaîne que `ME_QUERY_KEY` (Profil), cache partagé sans import du graphe UI. */
const ME_QUERY_KEY = ['me'] as const;

/** Nombre de séances « à faire » mises en avant sur l'accueil (le reste via « Voir toutes mes séances »). */
const MAX_TODO = 3;

/**
 * Accueil athlète (A-01 — TLX-089). Première impression après login : salutation, séances
 * **à faire** (plus proche échéance d'abord) et raccourcis. Pendant athlète du tableau de bord
 * coach (C-01). **Aucun endpoint dédié** : dérive des données déjà en cache —
 * `['assignments']` (partagé A-02/calendrier), `['groups','mine']` (section Profil, ADR-26) et
 * `['me']` (Profil) — donc zéro fetch redondant. États chargement / erreur / vide ; pull-to-refresh.
 */
export function AthleteHomeScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<User> => {
      const response = await getMe();
      if (response.status === 200) return response.data;
      throw response;
    },
  });

  const assignmentsQuery = useQuery({
    queryKey: ['assignments'],
    queryFn: async (): Promise<Assignment[]> => {
      const response = await listAssignments();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  // Rattachement : sert le CTA « rejoindre un groupe » quand l'athlète n'a aucun groupe (TLX-88).
  const groupsQuery = useQuery({
    queryKey: MY_GROUPS_QUERY_KEY,
    queryFn: async (): Promise<AthleteGroup[]> => {
      const response = await getMyGroups();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const pending = useMemo(
    () => selectPendingAssignments(assignmentsQuery.data ?? []),
    [assignmentsQuery.data],
  );
  const dueToday = useMemo(
    () => countDueToday(assignmentsQuery.data ?? [], new Date()),
    [assignmentsQuery.data],
  );
  // Série d'assiduité (TLX-115) : dérivée du cache déjà chargé, mise en avant si en cours.
  const streakWeeks = useMemo(
    () => computeAttendance(assignmentsQuery.data ?? [], new Date()).currentStreakWeeks,
    [assignmentsQuery.data],
  );

  const hasAssignments = (assignmentsQuery.data?.length ?? 0) > 0;
  const noGroup = groupsQuery.isSuccess && (groupsQuery.data?.length ?? 0) === 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      refreshControl={
        <RefreshControl
          refreshing={assignmentsQuery.isRefetching}
          onRefresh={() => void assignmentsQuery.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      {/* Salutation + résumé du jour + cloche notifications (TLX-92, découvrabilité). */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] }}>
        <View style={{ flex: 1, gap: spacing[1] }}>
          <Text
            testID="home-greeting"
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.h1.fontSize,
              letterSpacing: -0.5,
            }}
          >
            {greeting(me.data)}
          </Text>
          <Text
            testID="home-subtitle"
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {homeSubtitle(pending.length, dueToday)}
          </Text>
          <StreakBadge weeks={streakWeeks} />
        </View>
        <NotificationsBell />
      </View>

      {/* Rattachement manquant (TLX-88) : CTA rejoindre, point d'entrée découvrable dès l'accueil. */}
      {noGroup ? (
        <Card testID="home-join-group">
          <View style={{ gap: spacing[3] }}>
            <Text
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.body.fontSize,
              }}
            >
              Rejoins ton coach
            </Text>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Saisis le code d'invitation de ton coach pour recevoir tes séances et suivre ta
              progression.
            </Text>
            <Button
              testID="home-join-group-cta"
              fullWidth
              leftIcon={<Feather name="user-plus" size={18} color={colors.textOnAccent} />}
              onPress={() => router.push(joinGroupHref())}
            >
              Rejoindre un groupe
            </Button>
          </View>
        </Card>
      ) : null}

      {/* À faire — séances à venir, plus proche échéance d'abord. */}
      <View style={{ gap: spacing[3] }}>
        <SectionTitle>À faire</SectionTitle>

        {assignmentsQuery.isLoading ? (
          <View testID="home-loading" style={{ paddingVertical: spacing[4] }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : assignmentsQuery.isError ? (
          <Card testID="home-error">
            <View style={{ gap: spacing[3] }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                Impossible de charger tes séances.
              </Text>
              <Button testID="home-retry" onPress={() => void assignmentsQuery.refetch()}>
                Réessayer
              </Button>
            </View>
          </Card>
        ) : pending.length > 0 ? (
          <View style={{ gap: spacing[2] }}>
            {pending.slice(0, MAX_TODO).map((assignment) => (
              <AssignmentListItem
                key={assignment.id}
                assignment={assignment}
                testID={`home-todo-${assignment.id}`}
                onPress={() => router.push(sessionDetailHref(assignment.id))}
              />
            ))}
            {pending.length > MAX_TODO ? (
              <QuickLink
                testID="home-see-all-sessions"
                icon="list"
                label={`Voir toutes mes séances (${pending.length})`}
                onPress={() => router.push('/(athlete)/sessions')}
              />
            ) : null}
          </View>
        ) : hasAssignments ? (
          // Des séances existent mais aucune à faire : état positif.
          <Card testID="home-all-done" style={{ backgroundColor: colors.successBg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text
                style={{
                  color: colors.success,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Tout est fait — rien à faire pour l'instant.
              </Text>
            </View>
          </Card>
        ) : (
          // Aucune séance affectée : message accueillant (le CTA groupe ci-dessus guide si non rattaché).
          <Card testID="home-no-sessions">
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Aucune séance pour l'instant. Ton coach t'en affectera bientôt.
            </Text>
          </Card>
        )}
      </View>

      {/* Raccourcis vers les onglets clés. */}
      <View style={{ gap: spacing[3] }}>
        <SectionTitle>Raccourcis</SectionTitle>
        <View style={{ gap: spacing[2] }}>
          <QuickLink
            testID="home-shortcut-sessions"
            icon="activity"
            label="Mes séances"
            onPress={() => router.push('/(athlete)/sessions')}
          />
          <QuickLink
            testID="home-shortcut-calendar"
            icon="calendar"
            label="Mon calendrier"
            onPress={() => router.push('/(athlete)/calendar')}
          />
          <QuickLink
            testID="home-shortcut-progress"
            icon="trending-up"
            label="Ma progression"
            onPress={() => router.push('/(athlete)/progress')}
          />
        </View>
      </View>
    </ScrollView>
  );
}

/** Intitulé de section (uppercase, tokenisé) — aligné sur le dashboard coach. */
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

/** Carte-raccourci : icône + libellé + chevron, cliquable. */
function QuickLink({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: colors.accentSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name={icon} size={18} color={colors.accentText} />
          </View>
          <Text
            style={{
              flex: 1,
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {label}
          </Text>
          <Feather name="chevron-right" size={20} color={colors.textMuted} />
        </View>
      </Card>
    </Pressable>
  );
}

/** Salutation personnalisée si le prénom est connu, neutre sinon. */
function greeting(user: User | undefined): string {
  const first = user?.firstName?.trim();
  return first ? `Bonjour, ${first}` : 'Bonjour';
}

/** Sous-titre dynamique : met en avant les séances à faire et l'échéance du jour. */
function homeSubtitle(pendingCount: number, dueTodayCount: number): string {
  if (pendingCount === 0) return 'Rien à faire pour le moment.';
  if (dueTodayCount > 0) {
    return `${dueTodayCount} séance${dueTodayCount > 1 ? 's' : ''} prévue${
      dueTodayCount > 1 ? 's' : ''
    } aujourd'hui.`;
  }
  return `${pendingCount} séance${pendingCount > 1 ? 's' : ''} à faire.`;
}
