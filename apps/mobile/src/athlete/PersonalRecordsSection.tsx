import {
  getMyProgress,
  listMyRecords,
  type PersonalRecord,
  type Progress,
  type ProgressPoint,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { ManualRecordEditor } from './ManualRecordEditor';
import { RecordRow } from './progress-charts';

/** Clé de cache des records de l'athlète — invalidée à la confirmation (A-05). */
export const MY_RECORDS_QUERY_KEY = ['records', 'me'] as const;

/**
 * Section « Records personnels » (A-07 — TLX-091). Liste les records matérialisés de
 * l'athlète (`GET /athletes/me/records`, socle ADR-20) : épreuve, marque formatée, date.
 * Un record sans `performanceId` est badgé « manuel » (déclaré hors app). États
 * chargement / erreur / vide.
 */
export function PersonalRecordsSection() {
  const { colors, typography, spacing } = useTheme();

  const records = useQuery({
    queryKey: MY_RECORDS_QUERY_KEY,
    queryFn: async (): Promise<PersonalRecord[]> => {
      const response = await listMyRecords();
      if (response.status === 200) return response.data.items;
      throw response;
    },
    retry: false,
  });

  // SB par épreuve (ADR-34) : lu depuis la progression (même cache que A-06), pour afficher
  // « SB <année> » sous le PB. Best-effort — l'absence ne bloque jamais le rendu des records.
  const progress = useQuery({
    queryKey: ['progress', 'me'],
    queryFn: async (): Promise<Progress> => {
      const response = await getMyProgress();
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });
  const seasonBestByEvent = new Map<string, ProgressPoint>(
    (progress.data?.series ?? [])
      .filter((s): s is typeof s & { seasonBest: ProgressPoint } => s.seasonBest != null)
      .map((s) => [s.eventKey, s.seasonBest]),
  );

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
        Records personnels
      </Text>

      {/* Éditeur de record manuel (A-07 — TLX-116) : initialiser / corriger une marque. */}
      <ManualRecordEditor />

      {records.isLoading ? (
        <View testID="records-loading" style={{ paddingVertical: spacing[4] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : records.isError ? (
        <Card testID="records-error">
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger tes records.
            </Text>
            <Button testID="records-retry" onPress={() => void records.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : !records.data?.length ? (
        <Card testID="records-empty">
          <View style={{ alignItems: 'center', gap: spacing[2] }}>
            <Feather name="award" size={22} color={colors.textMuted} />
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Pas encore de record — saisis tes perfs, tes meilleures marques apparaîtront ici.
            </Text>
          </View>
        </Card>
      ) : (
        records.data.map((record) => (
          <RecordRow
            key={record.id}
            record={record}
            seasonBest={seasonBestByEvent.get(record.eventKey)}
          />
        ))
      )}
    </View>
  );
}
