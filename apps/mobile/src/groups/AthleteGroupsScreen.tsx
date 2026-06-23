import { getMyGroups, type AthleteGroup } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { joinGroupHref, athleteGroupDetailHref } from './navigation';
import { MY_GROUPS_QUERY_KEY } from './groups-query';
import { AthleteGroupHubScreen } from './AthleteGroupHubScreen';

/**
 * Onglet **Groupe** athlète (ADR-44 §3) — accès direct (sort de Profil). Résout `GET /groups/mine`
 * (ADR-26) : aucun groupe → CTA « rejoindre » ; **un** groupe → le hub directement (sans bouton
 * retour, c'est une racine d'onglet) ; **plusieurs** → liste → hub.
 */
export function AthleteGroupsScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  const query = useQuery({
    queryKey: MY_GROUPS_QUERY_KEY,
    queryFn: async (): Promise<AthleteGroup[]> => {
      const response = await getMyGroups();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const groups = query.data ?? [];

  // Un seul groupe : le hub remplit l'onglet (cas MVP courant), sans bouton retour.
  if (query.isSuccess && groups.length === 1) {
    return <AthleteGroupHubScreen groupId={groups[0].id} showBack={false} />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <Text
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.h2.fontSize,
        }}
      >
        {groups.length > 1 ? 'Mes groupes' : 'Groupe'}
      </Text>

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
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Saisis le code d'invitation de ton coach pour recevoir tes séances et voir tes
              coéquipiers.
            </Text>
            <Button
              testID="groups-join-cta"
              fullWidth
              leftIcon={<Feather name="user-plus" size={18} color={colors.textOnAccent} />}
              onPress={() => router.push(joinGroupHref())}
            >
              Rejoindre un groupe
            </Button>
          </View>
        </Card>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {groups.map((g) => (
            <Card
              key={g.id}
              testID={`groups-item-${g.id}`}
              onPress={() => router.push(athleteGroupDetailHref(g.id))}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
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
                    {(g.name?.[0] ?? 'G').toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.body.fontSize,
                    }}
                  >
                    {g.name}
                  </Text>
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    {g.memberCount} athlète{g.memberCount > 1 ? 's' : ''}
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textMuted} />
              </View>
            </Card>
          ))}
          {/* Multi-coach (ADR-51) : un athlète peut rejoindre d'autres groupes (coachs inclus). */}
          <Button
            testID="groups-join-another"
            variant="secondary"
            fullWidth
            leftIcon={<Feather name="plus" size={18} color={colors.accentText} />}
            onPress={() => router.push(joinGroupHref())}
          >
            Rejoindre un autre groupe
          </Button>
        </View>
      )}
    </ScrollView>
  );
}
