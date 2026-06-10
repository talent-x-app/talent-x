import {
  deleteGroup,
  getGroup,
  listGroupMembers,
  manageInviteCode,
  removeGroupMember,
  updateGroup,
  InviteCodeActionAction,
  type Group,
  type GroupMember,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Button, Card, Input } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { GROUPS_QUERY_KEY, groupMembersQueryKey, groupQueryKey } from './groups-query';

/**
 * Détail & gestion d'un groupe coach (TLX-87). Charge le groupe (`GET /groups/:id`) et ses
 * membres (`GET /groups/:id/members`). Permet : éditer nom/description (`PUT`), partager /
 * régénérer / révoquer le code d'invitation (`POST /:id/invite-code`, ADR-16), retirer un
 * membre (`DELETE /:id/members/:athleteId`), supprimer le groupe (`DELETE`, soft-delete).
 * États chargement / erreur ; tout via le design system.
 */
export function CoachGroupDetailScreen({ groupId }: { groupId: string }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const group = useQuery({
    queryKey: groupQueryKey(groupId),
    queryFn: async (): Promise<Group> => {
      const response = await getGroup(groupId);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const members = useQuery({
    queryKey: groupMembersQueryKey(groupId),
    queryFn: async (): Promise<GroupMember[]> => {
      const response = await listGroupMembers(groupId);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  useEffect(() => {
    if (!group.data) return;
    setName(group.data.name);
    setDescription(group.data.description ?? '');
  }, [group.data]);

  const invalidateGroup = () => {
    void queryClient.invalidateQueries({ queryKey: groupQueryKey(groupId) });
    void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: async (): Promise<Group> => {
      const response = await updateGroup(groupId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (response.status === 200) return response.data;
      throw response;
    },
    onSuccess: () => {
      invalidateGroup();
      setEditing(false);
      toast.show({ variant: 'success', title: 'Groupe mis à jour' });
    },
    onError: (error: unknown) => {
      const { title, description: d } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description: d });
    },
  });

  const invite = useMutation({
    mutationFn: async (action: InviteCodeActionAction): Promise<string | null> => {
      const response = await manageInviteCode(groupId, { action });
      if (response.status === 200) return response.data.inviteCode ?? null;
      throw response;
    },
    onSuccess: (_code, action) => {
      invalidateGroup();
      toast.show({
        variant: 'success',
        title: action === InviteCodeActionAction.revoke ? 'Code révoqué' : 'Nouveau code généré',
      });
    },
    onError: (error: unknown) => {
      const { title, description: d } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description: d });
    },
  });

  const remove = useMutation({
    mutationFn: async (athleteId: string): Promise<void> => {
      const response = await removeGroupMember(groupId, athleteId);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupMembersQueryKey(groupId) });
      invalidateGroup();
      toast.show({ variant: 'success', title: 'Membre retiré' });
    },
    onError: (error: unknown) => {
      const { title, description: d } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description: d });
    },
  });

  const removal = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await deleteGroup(groupId);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      toast.show({ variant: 'success', title: 'Groupe supprimé' });
      router.back();
    },
    onError: (error: unknown) => {
      const { title, description: d } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description: d });
    },
  });

  const onShareCode = async (code: string) => {
    try {
      await Share.share({
        message: `Rejoins mon groupe sur Talent-X avec ce code : ${code}`,
      });
    } catch {
      // Partage annulé/indisponible : sans gravité (le code reste affiché et copiable).
    }
  };

  if (group.isLoading) {
    return (
      <View
        testID="group-detail-loading"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (group.isError || !group.data) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing[6],
          backgroundColor: colors.background,
        }}
      >
        <Card testID="group-detail-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger ce groupe.
            </Text>
            <Button testID="group-detail-retry" onPress={() => void group.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      </View>
    );
  }

  const data = group.data;
  const memberList = members.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        testID="group-detail-back"
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
          Mes groupes
        </Text>
      </Pressable>

      {editing ? (
        <View style={{ gap: spacing[4] }}>
          <Input
            label="Nom du groupe"
            testID="group-edit-name"
            value={name}
            onChangeText={setName}
            editable={!save.isPending}
          />
          <Input
            label="Description (optionnel)"
            testID="group-edit-description"
            value={description}
            onChangeText={setDescription}
            placeholder="Niveau, discipline, créneau…"
            multiline
            editable={!save.isPending}
          />
          <View style={{ gap: spacing[2] }}>
            <Button
              testID="group-edit-save"
              fullWidth
              loading={save.isPending}
              disabled={name.trim() === ''}
              onPress={() => save.mutate()}
            >
              Enregistrer
            </Button>
            <Button
              testID="group-edit-cancel"
              variant="ghost"
              fullWidth
              disabled={save.isPending}
              onPress={() => {
                setEditing(false);
                setName(data.name);
                setDescription(data.description ?? '');
              }}
            >
              Annuler
            </Button>
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing[2] }}>
          <Text
            testID="group-detail-name"
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.h1.fontSize,
              letterSpacing: -0.5,
            }}
          >
            {data.name}
          </Text>
          {data.description ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
              }}
            >
              {data.description}
            </Text>
          ) : null}
          <Pressable testID="group-detail-edit" onPress={() => setEditing(true)}>
            <Text
              style={{
                color: colors.accentText,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Modifier le groupe
            </Text>
          </Pressable>
        </View>
      )}

      {/* Code d'invitation (ADR-16) : actif (partage + régénération) ou révoqué (génération). */}
      <View style={{ gap: spacing[3] }}>
        <SectionLabel>Code d'invitation</SectionLabel>
        <Card testID="group-invite-card">
          {data.inviteCode ? (
            <View style={{ gap: spacing[4] }}>
              <Text
                testID="group-invite-code"
                style={{
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily.bold,
                  fontSize: typography.h2.fontSize,
                  letterSpacing: 4,
                  textAlign: 'center',
                }}
              >
                {data.inviteCode}
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                  textAlign: 'center',
                }}
              >
                Partage ce code à tes athlètes : ils le saisissent pour rejoindre le groupe.
              </Text>
              <View style={{ gap: spacing[2] }}>
                <Button
                  testID="group-invite-share"
                  fullWidth
                  leftIcon={<Feather name="share-2" size={16} color={colors.textOnAccent} />}
                  onPress={() => void onShareCode(data.inviteCode as string)}
                >
                  Partager le code
                </Button>
                <Button
                  testID="group-invite-regenerate"
                  variant="secondary"
                  fullWidth
                  loading={
                    invite.isPending && invite.variables === InviteCodeActionAction.regenerate
                  }
                  onPress={() => invite.mutate(InviteCodeActionAction.regenerate)}
                >
                  Régénérer
                </Button>
                <Button
                  testID="group-invite-revoke"
                  variant="ghost"
                  fullWidth
                  loading={invite.isPending && invite.variables === InviteCodeActionAction.revoke}
                  onPress={() => invite.mutate(InviteCodeActionAction.revoke)}
                >
                  Révoquer
                </Button>
              </View>
            </View>
          ) : (
            <View style={{ gap: spacing[4] }}>
              <Text
                testID="group-invite-revoked"
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                Le code est révoqué — plus personne ne peut rejoindre le groupe.
              </Text>
              <Button
                testID="group-invite-generate"
                fullWidth
                loading={invite.isPending}
                onPress={() => invite.mutate(InviteCodeActionAction.regenerate)}
              >
                Générer un code
              </Button>
            </View>
          )}
        </Card>
      </View>

      {/* Membres */}
      <View style={{ gap: spacing[3] }}>
        <SectionLabel>Membres{members.data ? ` (${memberList.length})` : ''}</SectionLabel>
        {members.isLoading ? (
          <View testID="group-members-loading" style={{ paddingVertical: spacing[4] }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : members.isError ? (
          <Card testID="group-members-error">
            <View style={{ gap: spacing[3] }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.body.fontSize,
                  textAlign: 'center',
                }}
              >
                Impossible de charger les membres.
              </Text>
              <Button testID="group-members-retry" onPress={() => void members.refetch()}>
                Réessayer
              </Button>
            </View>
          </Card>
        ) : memberList.length === 0 ? (
          <Card testID="group-members-empty">
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Aucun membre pour l'instant. Partage le code ci-dessus.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {memberList.map((member) => (
              <MemberRow
                key={member.athleteId}
                member={member}
                removing={remove.isPending && remove.variables === member.athleteId}
                onRemove={() => remove.mutate(member.athleteId)}
              />
            ))}
          </View>
        )}
      </View>

      <Button
        testID="group-delete"
        variant="danger"
        fullWidth
        loading={removal.isPending}
        onPress={() => removal.mutate()}
      >
        Supprimer le groupe
      </Button>
    </ScrollView>
  );
}

/** Intitulé de section en capitales (aligné sur le dashboard coach). */
function SectionLabel({ children }: { children: React.ReactNode }) {
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

/** Ligne membre : initiales + nom + discipline, action « retirer ». */
function MemberRow({
  member,
  removing,
  onRemove,
}: {
  member: GroupMember;
  removing: boolean;
  onRemove: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const fullName = memberName(member);
  return (
    <Card testID={`group-member-${member.athleteId}`}>
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
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {memberInitials(member)}
          </Text>
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
            {fullName}
          </Text>
          {member.athlete?.sport ? (
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {member.athlete.sport}
            </Text>
          ) : null}
        </View>
        {removing ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Pressable
            testID={`group-member-remove-${member.athleteId}`}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${fullName}`}
            hitSlop={8}
          >
            <Feather name="user-x" size={18} color={colors.danger} />
          </Pressable>
        )}
      </View>
    </Card>
  );
}

function memberName(member: GroupMember): string {
  const name = [member.athlete?.firstName, member.athlete?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name.length > 0 ? name : 'Athlète';
}

function memberInitials(member: GroupMember): string {
  const letters = [member.athlete?.firstName?.[0], member.athlete?.lastName?.[0]]
    .filter(Boolean)
    .join('');
  return (letters || '?').toUpperCase();
}
