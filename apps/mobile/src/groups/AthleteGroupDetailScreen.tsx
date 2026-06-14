import {
  getGroupTeammates,
  getMyGroups,
  leaveGroup,
  type AthleteGroup,
  type GroupTeammate,
  type UserSummary,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { MY_GROUPS_QUERY_KEY, groupTeammatesQueryKey } from './groups-query';

/**
 * Détail d'un groupe vu par l'athlète (ADR-37) : nom, description, coach, effectif et
 * **roster des coéquipiers** (`GET /groups/:id/teammates`, vue pair minimisée), avec
 * l'action « Quitter le groupe ». Le méta du groupe (nom/coach/description) vient du
 * cache partagé `GET /groups/mine` (ADR-26) — pas de requête en double. Un 404 serveur
 * (non-membre / groupe inexistant) bascule sur l'état « coéquipiers indisponibles ».
 */
export function AthleteGroupDetailScreen({ groupId }: { groupId: string }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const myGroups = useQuery({
    queryKey: MY_GROUPS_QUERY_KEY,
    queryFn: async (): Promise<AthleteGroup[]> => {
      const response = await getMyGroups();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });
  const group = (myGroups.data ?? []).find((g) => g.id === groupId);

  const teammates = useQuery({
    queryKey: groupTeammatesQueryKey(groupId),
    queryFn: async (): Promise<GroupTeammate[]> => {
      const response = await getGroupTeammates(groupId);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const leave = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await leaveGroup(groupId);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_GROUPS_QUERY_KEY });
      toast.show({ variant: 'success', title: 'Groupe quitté' });
      router.back();
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const roster = teammates.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <Pressable
        testID="athlete-group-back"
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
          Profil
        </Text>
      </Pressable>

      {/* Méta du groupe (nom / description / coach) issus du cache `mine`. */}
      <View style={{ gap: spacing[2] }}>
        <Text
          testID="athlete-group-name"
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h1.fontSize,
            letterSpacing: -0.5,
          }}
        >
          {group?.name ?? 'Groupe'}
        </Text>
        {group?.description ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
            }}
          >
            {group.description}
          </Text>
        ) : null}
        {group ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Coach : {coachName(group.coach)}
          </Text>
        ) : null}
      </View>

      {/* Coéquipiers (ADR-37) : roster pair-à-pair minimisé. */}
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
          Coéquipiers{teammates.data ? ` (${roster.length})` : ''}
        </Text>

        {teammates.isLoading ? (
          <View testID="athlete-group-teammates-loading" style={{ paddingVertical: spacing[4] }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : teammates.isError ? (
          <Card testID="athlete-group-teammates-error">
            <View style={{ gap: spacing[3] }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                Impossible de charger les coéquipiers.
              </Text>
              <Button
                testID="athlete-group-teammates-retry"
                onPress={() => void teammates.refetch()}
              >
                Réessayer
              </Button>
            </View>
          </Card>
        ) : roster.length === 0 ? (
          <Card testID="athlete-group-teammates-empty">
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Tu es seul·e dans ce groupe pour l'instant.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {roster.map((teammate) => (
              <TeammateRow key={teammate.id} teammate={teammate} />
            ))}
          </View>
        )}
      </View>

      <Button
        testID="athlete-group-leave"
        variant="ghost"
        fullWidth
        loading={leave.isPending}
        onPress={() => leave.mutate()}
      >
        Quitter le groupe
      </Button>
    </ScrollView>
  );
}

/** Ligne coéquipier : avatar (photo ou initiales) + nom. Vue minimisée (ADR-37). */
function TeammateRow({ teammate }: { teammate: GroupTeammate }) {
  const { colors, typography, spacing } = useTheme();
  const fullName = teammateName(teammate);
  return (
    <Card testID={`athlete-group-teammate-${teammate.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        {teammate.avatarUrl ? (
          <Image
            testID={`athlete-group-teammate-${teammate.id}-avatar`}
            source={{ uri: teammate.avatarUrl }}
            style={{ width: 36, height: 36, borderRadius: 10 }}
          />
        ) : (
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
            <Text
              style={{
                color: colors.accentText,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {teammateInitials(teammate)}
            </Text>
          </View>
        )}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          {fullName}
        </Text>
      </View>
    </Card>
  );
}

function coachName(coach: UserSummary): string {
  const name = [coach.firstName, coach.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : 'ton coach';
}

function teammateName(teammate: GroupTeammate): string {
  const name = [teammate.firstName, teammate.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : 'Athlète';
}

function teammateInitials(teammate: GroupTeammate): string {
  const letters = [teammate.firstName?.[0], teammate.lastName?.[0]].filter(Boolean).join('');
  return (letters || '?').toUpperCase();
}
