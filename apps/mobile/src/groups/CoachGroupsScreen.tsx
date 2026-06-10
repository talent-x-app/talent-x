import { createGroup, listGroups, type Group, type GroupCreate } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card, Input } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { GROUPS_QUERY_KEY } from './groups-query';
import { groupDetailHref } from './navigation';

/**
 * Liste « Mes groupes » du coach (TLX-87). Consomme `GET /groups` (les siens). Création
 * inline (nom requis → `POST /groups`), chaque ligne ouvre le détail/gestion. États
 * chargement / erreur / vide, pull-to-refresh. Cache `['groups']` partagé/invalidé avec
 * le détail.
 */
export function CoachGroupsScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const query = useQuery({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: async (): Promise<Group[]> => {
      const response = await listGroups();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const create = useMutation({
    mutationFn: async (): Promise<Group> => {
      const body: GroupCreate = { name: name.trim() };
      const response = await createGroup(body);
      if (response.status === 201) return response.data;
      throw response;
    },
    onSuccess: (group) => {
      void queryClient.invalidateQueries({ queryKey: GROUPS_QUERY_KEY });
      setCreating(false);
      setName('');
      toast.show({ variant: 'success', title: 'Groupe créé' });
      // Enchaîne sur la gestion (partage du code d'invitation).
      router.push(groupDetailHref(group.id));
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const groups = query.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <Pressable
        testID="groups-back"
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

      <View style={{ gap: spacing[1] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h1.fontSize,
            letterSpacing: -0.5,
          }}
        >
          Mes groupes
        </Text>
        {query.data ? (
          <Text
            testID="groups-count"
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {groups.length} groupe{groups.length > 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      {creating ? (
        <Card testID="group-create-form">
          <View style={{ gap: spacing[4] }}>
            <Input
              label="Nom du groupe"
              testID="group-create-name"
              value={name}
              onChangeText={setName}
              placeholder="Ex. Sprint élite"
              autoFocus
              editable={!create.isPending}
            />
            <View style={{ gap: spacing[2] }}>
              <Button
                testID="group-create-submit"
                fullWidth
                loading={create.isPending}
                disabled={name.trim() === ''}
                onPress={() => create.mutate()}
              >
                Créer le groupe
              </Button>
              <Button
                testID="group-create-cancel"
                variant="ghost"
                fullWidth
                disabled={create.isPending}
                onPress={() => {
                  setCreating(false);
                  setName('');
                }}
              >
                Annuler
              </Button>
            </View>
          </View>
        </Card>
      ) : (
        <Button
          testID="group-create"
          fullWidth
          leftIcon={<Feather name="plus" size={18} color={colors.textOnAccent} />}
          onPress={() => setCreating(true)}
        >
          Nouveau groupe
        </Button>
      )}

      {query.isLoading ? (
        <View testID="groups-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Card testID="groups-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger tes groupes.
            </Text>
            <Button testID="groups-retry" onPress={() => void query.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : groups.length === 0 ? (
        <Card testID="groups-empty">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Aucun groupe pour l'instant. Crée-en un, puis partage son code pour qu'un athlète te
            rejoigne.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {groups.map((group) => (
            <GroupListItem
              key={group.id}
              group={group}
              onPress={() => router.push(groupDetailHref(group.id))}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/** Ligne groupe : pastille, nom, nombre de membres, chevron. */
function GroupListItem({ group, onPress }: { group: Group; onPress: () => void }) {
  const { colors, typography, spacing } = useTheme();
  const count = group.memberCount ?? 0;
  return (
    <Card testID={`group-item-${group.id}`} onPress={onPress}>
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
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {count} membre{count > 1 ? 's' : ''}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}
