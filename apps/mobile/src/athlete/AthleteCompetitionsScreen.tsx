import { listCompetitions, type Competition } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { CompetitionListItem } from '../competitions/competition-ui';
import { COMPETITIONS_QUERY_KEY } from '../competitions/competitions-query';
import { athleteCompetitionDetailHref } from '../competitions/navigation';

/**
 * Compétitions de l'athlète (TLX-101, ADR-24). Consomme `GET /competitions` (role-aware :
 * l'athlète reçoit celles où il est engagé). Lignes cliquables vers le détail (lecture seule —
 * l'athlète ne s'auto-inscrit pas au MVP). États chargement / erreur / vide, pull-to-refresh.
 * Cache partagé `['competitions']` avec le calendrier athlète.
 */
export function AthleteCompetitionsScreen() {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  const query = useQuery({
    queryKey: COMPETITIONS_QUERY_KEY,
    queryFn: async (): Promise<Competition[]> => {
      const response = await listCompetitions();
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const competitions = query.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <Pressable
        testID="competitions-back"
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
            fontSize: typography.h2.fontSize,
          }}
        >
          Mes compétitions
        </Text>
        {query.data ? (
          <Text
            testID="competitions-count"
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {competitions.length} compétition{competitions.length > 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      {query.isLoading ? (
        <View testID="competitions-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Card testID="competitions-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger tes compétitions.
            </Text>
            <Button testID="competitions-retry" onPress={() => void query.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : competitions.length === 0 ? (
        <Card testID="competitions-empty">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Aucune compétition pour l'instant. Ton coach t'y engagera.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {competitions.map((competition) => (
            <CompetitionListItem
              key={competition.id}
              competition={competition}
              onPress={() => router.push(athleteCompetitionDetailHref(competition.id))}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}
