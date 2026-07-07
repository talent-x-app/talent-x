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
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { Button, Card, InlineConfirm, Input, QrCode, SegmentedTabs } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { GROUPS_QUERY_KEY, groupMembersQueryKey, groupQueryKey } from './groups-query';
import { AnnouncementsPane } from './announcements-ui';

type GroupTab = 'members' | 'announcements' | 'settings';

/**
 * Détail & gestion d'un groupe coach (TLX-87, refonte « bandeau + onglets »). Bandeau d'identité
 * (monogramme + nom + stats) puis onglets **Membres** (code d'invitation + roster), **Annonces**
 * (canal descendant ADR-46) et **Réglages** (édition + zone danger). Toutes les actions
 * destructives (retrait membre, régénération/révocation du code, suppression du groupe) passent
 * par une **confirmation inline** (robuste web + natif). Charge `GET /groups/:id` + `/members`.
 */
export function CoachGroupDetailScreen({ groupId }: { groupId: string }) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<GroupTab>('members');

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
  const memberCount = members.data?.length ?? data.memberCount ?? 0;
  const codeActive = Boolean(data.inviteCode);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Bandeau d'identité collant. */}
      <View
        style={{
          paddingHorizontal: spacing[5],
          paddingTop: spacing[5],
          paddingBottom: spacing[3],
          gap: spacing[4],
          borderBottomWidth: borderWidth.hairline,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <Pressable
          testID="group-detail-back"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[1],
            alignSelf: 'flex-start',
          }}
          hitSlop={8}
        >
          <Feather name="chevron-left" size={20} color={colors.textSecondary} />
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              width: 52,
              height: 52,
              borderRadius: radius.md,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: colors.textOnAccent,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.title.fontSize,
              }}
            >
              {groupInitials(data.name)}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              testID="group-detail-name"
              numberOfLines={1}
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h3.fontSize,
                letterSpacing: -0.2,
              }}
            >
              {data.name}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {memberCount} membre{memberCount > 1 ? 's' : ''}
              </Text>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: radius.pill,
                  backgroundColor: colors.textMuted,
                }}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: radius.pill,
                    backgroundColor: codeActive ? colors.success : colors.textMuted,
                  }}
                />
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.bodySm.fontSize,
                  }}
                >
                  {codeActive ? 'code actif' : 'code révoqué'}
                </Text>
              </View>
            </View>
          </View>
          <Pressable
            testID="group-detail-edit"
            onPress={() => setTab('settings')}
            accessibilityRole="button"
            accessibilityLabel="Réglages du groupe"
            hitSlop={8}
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceSunken,
            }}
          >
            <Feather name="settings" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>

        <SegmentedTabs
          testID="coach-group-tabs"
          items={[
            { key: 'members', label: 'Membres' },
            { key: 'announcements', label: 'Annonces' },
            { key: 'settings', label: 'Réglages' },
          ]}
          activeKey={tab}
          onChange={(k) => setTab(k as GroupTab)}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing[5], gap: spacing[5] }}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'members' ? (
          <MembersTab groupId={groupId} group={data} members={members} />
        ) : tab === 'announcements' ? (
          <AnnouncementsPane groupId={groupId} canManage />
        ) : (
          <SettingsTab groupId={groupId} group={data} />
        )}
      </ScrollView>
    </View>
  );
}

/** Onglet **Membres** : carte code d'invitation + recherche + roster (retrait avec confirmation). */
function MembersTab({
  groupId,
  group,
  members,
}: {
  groupId: string;
  group: Group;
  members: UseQueryResult<GroupMember[]>;
}) {
  const { colors, typography, spacing } = useTheme();
  const [search, setSearch] = useState('');

  const memberList = members.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return memberList;
    return memberList.filter((m) => memberName(m).toLowerCase().includes(q));
  }, [memberList, search]);

  return (
    <View style={{ gap: spacing[5] }}>
      <InviteCodeCard groupId={groupId} group={group} />

      <View style={{ gap: spacing[3] }}>
        <SectionLabel>Membres{members.data ? ` (${memberList.length})` : ''}</SectionLabel>

        {memberList.length > 3 ? (
          <Input
            testID="group-members-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher un membre"
            autoCapitalize="none"
          />
        ) : null}

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
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Aucun membre pour l'instant. Partage le code ci-dessus.
            </Text>
          </Card>
        ) : filtered.length === 0 ? (
          <Card testID="group-members-no-match">
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Aucun membre ne correspond à « {search.trim()} ».
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {filtered.map((member) => (
              <MemberRow key={member.athleteId} groupId={groupId} member={member} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * Carte code d'invitation (ADR-16) repensée : code « boxé » lisible, **Copier** + **Partager** au
 * premier plan, gestion (Régénérer / Révoquer) repliée derrière un disclosure avec confirmation.
 * État révoqué : message clair + unique CTA « Générer un code ».
 */
function InviteCodeCard({ groupId, group }: { groupId: string; group: Group }) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [manageOpen, setManageOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [pending, setPending] = useState<InviteCodeActionAction | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: groupQueryKey(groupId) });
    void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
  };

  const invite = useMutation({
    mutationFn: async (action: InviteCodeActionAction): Promise<void> => {
      const response = await manageInviteCode(groupId, { action });
      if (response.status !== 200) throw response;
    },
    onSuccess: (_d, action) => {
      invalidate();
      setManageOpen(false);
      setPending(null);
      toast.show({
        variant: 'success',
        title: action === InviteCodeActionAction.revoke ? 'Code révoqué' : 'Nouveau code généré',
      });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const code = group.inviteCode ?? undefined;

  const shareCode = async () => {
    if (!code) return;
    try {
      await Share.share({ message: `Rejoins mon groupe sur Talent-X avec ce code : ${code}` });
    } catch {
      // Partage annulé/indisponible : sans gravité (le code reste affiché et copiable).
    }
  };

  const copyCode = async () => {
    if (!code) return;
    const clip = (
      globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } }
    ).navigator?.clipboard;
    if (clip?.writeText) {
      try {
        await clip.writeText(code);
        toast.show({ variant: 'success', title: 'Code copié' });
        return;
      } catch {
        // Échec d'écriture presse-papier (permissions web) → repli sur le partage natif/OS.
      }
    }
    void shareCode();
  };

  return (
    <View style={{ gap: spacing[3] }}>
      <SectionLabel>Code d'invitation</SectionLabel>
      <Card testID="group-invite-card">
        {code ? (
          <View style={{ gap: spacing[4] }}>
            {/* Code « boxé » : un caractère par case, lisible et propre. */}
            <View
              testID="group-invite-code"
              accessibilityLabel={`Code d'invitation : ${code.split('').join(' ')}`}
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: spacing[1],
              }}
            >
              {code.split('').map((ch, i) => (
                <View
                  key={`${ch}-${i}`}
                  style={{
                    minWidth: 30,
                    paddingHorizontal: spacing[1],
                    paddingVertical: spacing[2],
                    borderRadius: radius.sm,
                    backgroundColor: colors.surfaceSunken,
                    borderWidth: borderWidth.hairline,
                    borderColor: colors.border,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.bold,
                      fontSize: typography.title.fontSize,
                    }}
                  >
                    {ch}
                  </Text>
                </View>
              ))}
            </View>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
                textAlign: 'center',
              }}
            >
              Partage-le à tes athlètes pour qu'ils rejoignent le groupe.
            </Text>

            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Button
                  testID="group-invite-copy"
                  variant="secondary"
                  fullWidth
                  leftIcon={<Feather name="copy" size={16} color={colors.accentText} />}
                  onPress={() => void copyCode()}
                >
                  Copier
                </Button>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  testID="group-invite-share"
                  fullWidth
                  leftIcon={<Feather name="share-2" size={16} color={colors.textOnAccent} />}
                  onPress={() => void shareCode()}
                >
                  Partager
                </Button>
              </View>
            </View>

            {/* QR du code : à présenter en séance, l'athlète le scanne pour rejoindre. */}
            <Pressable
              testID="group-invite-qr-toggle"
              onPress={() => setQrOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: qrOpen }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing[1],
              }}
            >
              <Feather name="maximize" size={15} color={colors.textSecondary} />
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {qrOpen ? 'Masquer le QR' : 'Afficher le QR'}
              </Text>
            </Pressable>

            {qrOpen ? (
              <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] }}>
                <QrCode value={code} size={184} testID="group-invite-qr" />
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.caption.fontSize,
                    textAlign: 'center',
                  }}
                >
                  À scanner par tes athlètes pour rejoindre le groupe.
                </Text>
              </View>
            ) : null}

            {/* Gestion repliée : actions rares démotées (régénérer / révoquer), avec confirmation. */}
            <Pressable
              testID="group-invite-manage"
              onPress={() => {
                setManageOpen((o) => !o);
                setPending(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ expanded: manageOpen }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing[1],
              }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Gérer le code
              </Text>
              <Feather
                name={manageOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.textSecondary}
              />
            </Pressable>

            {manageOpen ? (
              pending ? (
                <InlineConfirm
                  message={
                    pending === InviteCodeActionAction.revoke
                      ? 'Révoquer le code ? Plus personne ne pourra rejoindre tant que tu n’en génères pas un nouveau.'
                      : 'Régénérer le code ? L’ancien code cessera immédiatement de fonctionner.'
                  }
                  confirmLabel={
                    pending === InviteCodeActionAction.revoke ? 'Révoquer' : 'Régénérer'
                  }
                  confirmTestID={
                    pending === InviteCodeActionAction.revoke
                      ? 'group-invite-revoke-confirm'
                      : 'group-invite-regenerate-confirm'
                  }
                  danger={pending === InviteCodeActionAction.revoke}
                  loading={invite.isPending}
                  onConfirm={() => invite.mutate(pending)}
                  onCancel={() => setPending(null)}
                />
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing[2] }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      testID="group-invite-regenerate"
                      variant="secondary"
                      fullWidth
                      onPress={() => setPending(InviteCodeActionAction.regenerate)}
                    >
                      Régénérer
                    </Button>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      testID="group-invite-revoke"
                      variant="ghost"
                      fullWidth
                      onPress={() => setPending(InviteCodeActionAction.revoke)}
                    >
                      Révoquer
                    </Button>
                  </View>
                </View>
              )
            ) : null}
          </View>
        ) : (
          <View style={{ gap: spacing[4] }}>
            <Text
              testID="group-invite-revoked"
              style={{
                color: colors.textSecondary,
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
  );
}

/** Onglet **Réglages** : édition nom/description + zone danger (suppression avec confirmation). */
function SettingsTab({ groupId, group }: { groupId: string; group: Group }) {
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setName(group.name);
    setDescription(group.description ?? '');
  }, [group.name, group.description]);

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await updateGroup(groupId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      if (response.status !== 200) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupQueryKey(groupId) });
      void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      toast.show({ variant: 'success', title: 'Groupe mis à jour' });
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

  const trimmed = name.trim();
  const dirty = trimmed !== group.name || description.trim() !== (group.description ?? '');

  return (
    <View style={{ gap: spacing[5] }}>
      <View style={{ gap: spacing[3] }}>
        <SectionLabel>Informations</SectionLabel>
        <Card>
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
            <Button
              testID="group-edit-save"
              fullWidth
              loading={save.isPending}
              disabled={trimmed === '' || !dirty}
              onPress={() => save.mutate()}
            >
              Enregistrer
            </Button>
          </View>
        </Card>
      </View>

      <View style={{ gap: spacing[3] }}>
        <SectionLabel>Zone danger</SectionLabel>
        <Card>
          {confirmingDelete ? (
            <InlineConfirm
              message={`Supprimer « ${group.name} » ? Les membres perdront l’accès. Action irréversible.`}
              confirmLabel="Supprimer définitivement"
              confirmTestID="group-delete-confirm"
              danger
              loading={removal.isPending}
              onConfirm={() => removal.mutate()}
              onCancel={() => setConfirmingDelete(false)}
            />
          ) : (
            <Button
              testID="group-delete"
              variant="danger"
              fullWidth
              onPress={() => setConfirmingDelete(true)}
            >
              Supprimer le groupe
            </Button>
          )}
        </Card>
      </View>
    </View>
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

/** Ligne membre : initiales + nom + discipline, retrait avec confirmation inline. */
function MemberRow({ groupId, member }: { groupId: string; member: GroupMember }) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const fullName = memberName(member);

  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await removeGroupMember(groupId, member.athleteId);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupMembersQueryKey(groupId) });
      void queryClient.invalidateQueries({ queryKey: groupQueryKey(groupId) });
      void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      toast.show({ variant: 'success', title: 'Membre retiré' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  return (
    <Card testID={`group-member-${member.athleteId}`}>
      <View style={{ gap: confirming ? spacing[3] : 0 }}>
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
                  color: colors.textSecondary,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {member.athlete.sport}
              </Text>
            ) : null}
          </View>
          {remove.isPending ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Pressable
              testID={`group-member-remove-${member.athleteId}`}
              onPress={() => setConfirming((c) => !c)}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${fullName}`}
              hitSlop={8}
            >
              <Feather
                name={confirming ? 'x' : 'user-x'}
                size={18}
                color={confirming ? colors.textMuted : colors.danger}
              />
            </Pressable>
          )}
        </View>

        {confirming ? (
          <InlineConfirm
            message={`Retirer ${fullName} du groupe ?`}
            confirmLabel="Retirer"
            confirmTestID={`group-member-remove-confirm-${member.athleteId}`}
            danger
            loading={remove.isPending}
            onConfirm={() => remove.mutate()}
            onCancel={() => setConfirming(false)}
          />
        ) : null}
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
