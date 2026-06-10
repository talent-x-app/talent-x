import { joinGroup, type GroupMember, type JoinGroupRequest } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Input } from '../components/ui';
import { useToast } from '../feedback';
import { MY_GROUPS_QUERY_KEY } from './groups-query';

/** Statut HTTP éventuellement porté par l'erreur rejetée du client généré. */
function statusOf(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: number }).status
    : undefined;
}

/**
 * « Rejoindre un groupe » athlète (TLX-88). Saisie d'un code → `POST /groups/join`.
 * Idempotent côté backend (déjà membre → 200). Gère le 404 (code invalide ou révoqué)
 * par un message inline. Au succès, invalide `['groups','mine']` et revient en arrière.
 */
export function JoinGroupScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: async (): Promise<GroupMember> => {
      const body: JoinGroupRequest = { inviteCode: code.trim() };
      const response = await joinGroup(body);
      if (response.status === 200) return response.data;
      throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MY_GROUPS_QUERY_KEY });
      toast.show({ variant: 'success', title: 'Groupe rejoint' });
      router.back();
    },
    onError: (err: unknown) => {
      if (statusOf(err) === 404) {
        setError('Code invalide ou révoqué. Vérifie-le auprès de ton coach.');
        return;
      }
      setError('Impossible de rejoindre le groupe. Réessaie.');
    },
  });

  function onSubmit() {
    setError(null);
    if (code.trim() === '') {
      setError('Saisis le code communiqué par ton coach.');
      return;
    }
    join.mutate();
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        testID="join-group-back"
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

      <View style={{ gap: spacing[2] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h1.fontSize,
            letterSpacing: -0.5,
          }}
        >
          Rejoindre un groupe
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
          }}
        >
          Saisis le code d'invitation que ton coach t'a communiqué pour te rattacher à son groupe.
        </Text>
      </View>

      <Card>
        <View style={{ gap: spacing[4] }}>
          <Input
            label="Code d'invitation"
            testID="join-group-code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="Ex. ABCD2345"
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            editable={!join.isPending}
            error={error ?? undefined}
          />
          <Button
            testID="join-group-submit"
            size="lg"
            fullWidth
            loading={join.isPending}
            disabled={code.trim() === ''}
            onPress={onSubmit}
          >
            Rejoindre
          </Button>
        </View>
      </Card>
    </ScrollView>
  );
}
