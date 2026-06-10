import { listMyRecords, type PersonalRecord } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { formatSessionDate } from './athlete-session-ui';
import { formatRecordValue } from './perf-entry';

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
        records.data.map((record) => <RecordRow key={record.id} record={record} />)
      )}
    </View>
  );
}

/** Ligne record : épreuve + marque mise en avant + date (+ badge « manuel »). */
function RecordRow({ record }: { record: PersonalRecord }) {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <Card testID={`record-${record.eventKey}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.accentSubtle,
          }}
        >
          <Feather name="award" size={18} color={colors.accentText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {record.label}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {formatSessionDate(record.achievedAt)}
            {record.performanceId == null ? ' · manuel' : ''}
          </Text>
        </View>
        <Text
          testID={`record-${record.eventKey}-value`}
          style={{
            color: colors.accentText,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h3.fontSize,
          }}
        >
          {formatRecordValue(record.value, record.unit)}
        </Text>
      </View>
    </Card>
  );
}
