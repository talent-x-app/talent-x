import {
  getCompetition,
  listEntries,
  type Competition,
  type CompetitionEntry,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import {
  CompetitionEntryStatusBadge,
  CompetitionStatusBadge,
  formatCompetitionPeriod,
} from '../competitions/competition-ui';
import { competitionEntriesQueryKey } from '../competitions/competitions-query';

/**
 * Détail d'une compétition côté athlète (TLX-101, ADR-24 — lecture seule). Consomme
 * `GET /competitions/:id` (autorisé car l'athlète est engagé) et `GET /competitions/:id/entries`
 * pour le récapitulatif des engagements. L'athlète ne s'auto-inscrit pas au MVP : aucune action
 * d'écriture. États chargement / erreur.
 */
export function CompetitionDetailScreen({ competitionId }: { competitionId: string }) {
  const { colors, typography, spacing } = useTheme();
  const router = useRouter();

  const competition = useQuery({
    queryKey: ['competition', competitionId],
    queryFn: async (): Promise<Competition> => {
      const response = await getCompetition(competitionId);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const entries = useQuery({
    queryKey: competitionEntriesQueryKey(competitionId),
    queryFn: async (): Promise<CompetitionEntry[]> => {
      const response = await listEntries(competitionId);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <Pressable
        testID="competition-detail-back"
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
          Mes compétitions
        </Text>
      </Pressable>

      {competition.isLoading ? (
        <View testID="competition-detail-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : competition.isError || !competition.data ? (
        <Card testID="competition-detail-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger cette compétition.
            </Text>
            <Button testID="competition-detail-retry" onPress={() => void competition.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : (
        <>
          <View style={{ gap: spacing[3] }}>
            <Text
              testID="competition-detail-name"
              style={{
                color: colors.textPrimary,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.h1.fontSize,
                letterSpacing: -0.5,
              }}
            >
              {competition.data.name}
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <CompetitionStatusBadge status={competition.data.status} />
            </View>
          </View>

          <Card>
            <View style={{ gap: spacing[4] }}>
              <DetailRow
                icon="calendar"
                label="Quand"
                value={formatCompetitionPeriod(
                  competition.data.startDate,
                  competition.data.endDate,
                )}
              />
              {competition.data.location ? (
                <DetailRow icon="map-pin" label="Où" value={competition.data.location} />
              ) : null}
              {competition.data.discipline ? (
                <DetailRow icon="award" label="Discipline" value={competition.data.discipline} />
              ) : null}
              {competition.data.description ? (
                <DetailRow icon="file-text" label="Détails" value={competition.data.description} />
              ) : null}
            </View>
          </Card>

          {/* Récapitulatif des engagements (épreuve + statut). */}
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
              Engagements
            </Text>
            {entries.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : entries.data && entries.data.length > 0 ? (
              <View style={{ gap: spacing[2] }}>
                {entries.data.map((entry) => (
                  <Card key={entry.id} testID={`competition-entry-${entry.id}`}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: spacing[3],
                      }}
                    >
                      <Text
                        style={{
                          color: colors.textPrimary,
                          fontFamily: typography.fontFamily.medium,
                          fontSize: typography.body.fontSize,
                        }}
                      >
                        {entry.eventLabel?.trim() || 'Épreuve non précisée'}
                      </Text>
                      <CompetitionEntryStatusBadge status={entry.status} />
                    </View>
                  </Card>
                ))}
              </View>
            ) : (
              <Text
                style={{
                  color: colors.textMuted,
                  fontFamily: typography.fontFamily.regular,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                Aucun engagement enregistré.
              </Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

/** Ligne d'information icône + libellé + valeur. */
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: spacing[3] }}>
      <Feather name={icon} size={18} color={colors.textMuted} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.caption.fontSize,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
          }}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}
