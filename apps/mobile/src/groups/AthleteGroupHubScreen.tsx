import { getMyGroups, leaveGroup, type AthleteGroup, type UserSummary } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, SegmentedTabs } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { NotificationsBell } from '../notifications/NotificationsBell';
import { MY_GROUPS_QUERY_KEY } from './groups-query';
import { TeammatesPane } from './group-teammates-ui';

type HubTab = 'teammates' | 'info';

/**
 * Hub de groupe vu par l'athlète (ADR-43, recentré par **ADR-44 §1** : « mince »). En-tête compact
 * (avatar + nom + « Coach · N athlètes » + cloche) puis onglets segmentés **Coéquipiers** (roster
 * ADR-37) et **Infos** (méta + quitter). Le fil de séances / le calendrier ne sont **plus** ici :
 * ils vivent dans l'onglet Séances unique (ADR-44 §2). Le méta vient du cache `GET /groups/mine`
 * (ADR-26). `showBack=false` quand le hub est la racine de l'onglet Groupe (un seul groupe).
 */
export function AthleteGroupHubScreen({
  groupId,
  showBack = true,
}: {
  groupId: string;
  showBack?: boolean;
}) {
  const { colors, typography, spacing, borderWidth } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<HubTab>('teammates');

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

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* En-tête collant. */}
      <View
        style={{
          paddingHorizontal: spacing[5],
          paddingTop: spacing[5],
          paddingBottom: spacing[3],
          gap: spacing[3],
          borderBottomWidth: borderWidth.hairline,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          {showBack ? (
            <Pressable
              testID="athlete-group-back"
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Retour"
              hitSlop={8}
            >
              <Feather name="chevron-left" size={24} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: colors.textOnAccent,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.body.fontSize,
              }}
            >
              {groupInitials(group?.name)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              testID="athlete-group-name"
              numberOfLines={1}
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h3.fontSize,
              }}
            >
              {group?.name ?? 'Groupe'}
            </Text>
            {group ? (
              <Text
                numberOfLines={1}
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Coach {coachName(group.coach)} · {group.memberCount} athlète
                {group.memberCount > 1 ? 's' : ''}
              </Text>
            ) : null}
          </View>
          <NotificationsBell />
        </View>

        <SegmentedTabs
          testID="athlete-group-tabs"
          items={[
            { key: 'teammates', label: 'Coéquipiers' },
            { key: 'info', label: 'Infos' },
          ]}
          activeKey={tab}
          onChange={(k) => setTab(k as HubTab)}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing[5], gap: spacing[5] }}
      >
        {tab === 'teammates' ? (
          <TeammatesPane groupId={groupId} />
        ) : (
          <GroupInfoPane group={group} groupId={groupId} />
        )}
      </ScrollView>
    </View>
  );
}

/** Onglet **Infos** : méta du groupe + « Quitter le groupe » avec confirmation inline (ADR-44 §6). */
function GroupInfoPane({ group, groupId }: { group?: AthleteGroup; groupId: string }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

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

  return (
    <View style={{ gap: spacing[5] }}>
      <View style={{ gap: spacing[2] }}>
        {group?.description ? (
          <Text
            testID="athlete-group-description"
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

      {/* Action destructive : confirmation inline (ADR-44 §6) — robuste web + natif. */}
      <Card>
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
              Quitter « {group?.name ?? 'ce groupe'} » ? Tu ne verras plus ses séances ni ses
              coéquipiers.
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID="athlete-group-leave-cancel"
                  variant="secondary"
                  fullWidth
                  onPress={() => setConfirming(false)}
                >
                  Annuler
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID="athlete-group-leave-confirm"
                  variant="danger"
                  fullWidth
                  loading={leave.isPending}
                  onPress={() => leave.mutate()}
                >
                  Quitter
                </Button>
              </View>
            </View>
          </View>
        ) : (
          <Button
            testID="athlete-group-leave"
            variant="ghost"
            fullWidth
            onPress={() => setConfirming(true)}
          >
            Quitter le groupe
          </Button>
        )}
      </Card>
    </View>
  );
}

function coachName(coach: UserSummary): string {
  const name = [coach.firstName, coach.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : 'ton coach';
}

function groupInitials(name: string | undefined): string {
  if (!name) return 'G';
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (letters || 'G').toUpperCase();
}
