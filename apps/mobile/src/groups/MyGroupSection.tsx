import { getMyGroups, leaveGroup, type AthleteGroup, type UserSummary } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { MY_GROUPS_QUERY_KEY } from './groups-query';
import { joinGroupHref } from './navigation';

/**
 * Section « Mon groupe / Mon coach » du Profil athlète (TLX-88, ADR-26). Consomme
 * `GET /groups/mine` : pour chaque groupe actif, affiche le nom, le coach et l'effectif,
 * avec l'action « Quitter le groupe » (`POST /groups/:id/leave`). État vide → CTA
 * « Rejoindre un groupe » (point d'entrée découvrable depuis le Profil).
 */
export function MyGroupSection() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: MY_GROUPS_QUERY_KEY,
    queryFn: async (): Promise<AthleteGroup[]> => {
      const response = await getMyGroups();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const leave = useMutation({
    mutationFn: async (groupId: string): Promise<void> => {
      const response = await leaveGroup(groupId);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_GROUPS_QUERY_KEY });
      toast.show({ variant: 'success', title: 'Groupe quitté' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const groups = query.data ?? [];

  return (
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
        Mon groupe
      </Text>

      {query.isLoading ? (
        <View testID="my-group-loading" style={{ paddingVertical: spacing[4] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Card testID="my-group-error">
          <View style={{ gap: spacing[3] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger ton rattachement.
            </Text>
            <Button testID="my-group-retry" onPress={() => void query.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : groups.length === 0 ? (
        <Card testID="my-group-empty">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Tu n'as pas encore rejoint de groupe. Saisis le code de ton coach pour te rattacher.
            </Text>
            <Button
              testID="my-group-join"
              fullWidth
              leftIcon={<Feather name="user-plus" size={18} color={colors.textOnAccent} />}
              onPress={() => router.push(joinGroupHref())}
            >
              Rejoindre un groupe
            </Button>
          </View>
        </Card>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {groups.map((group) => (
            <MyGroupCard
              key={group.id}
              group={group}
              leaving={leave.isPending && leave.variables === group.id}
              onLeave={() => leave.mutate(group.id)}
            />
          ))}
          <Button
            testID="my-group-join-more"
            variant="secondary"
            fullWidth
            leftIcon={<Feather name="user-plus" size={16} color={colors.textPrimary} />}
            onPress={() => router.push(joinGroupHref())}
          >
            Rejoindre un autre groupe
          </Button>
        </View>
      )}
    </View>
  );
}

/** Carte d'un groupe rejoint : nom, coach, effectif, action « Quitter ». */
function MyGroupCard({
  group,
  leaving,
  onLeave,
}: {
  group: AthleteGroup;
  leaving: boolean;
  onLeave: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const count = group.memberCount;
  return (
    <Card testID={`my-group-${group.id}`}>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.accentSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="users" size={18} color={colors.accentText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              numberOfLines={1}
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.body.fontSize,
              }}
            >
              {group.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Coach : {coachName(group.coach)} · {count} membre{count > 1 ? 's' : ''}
            </Text>
          </View>
        </View>
        <Button
          testID={`my-group-leave-${group.id}`}
          variant="ghost"
          fullWidth
          loading={leaving}
          onPress={onLeave}
        >
          Quitter le groupe
        </Button>
      </View>
    </Card>
  );
}

function coachName(coach: UserSummary): string {
  const name = [coach.firstName, coach.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : 'ton coach';
}
