import { confirmRecord, type Performance, type RecordCandidate } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { useToast } from '../feedback';
import { formatRecordValue } from './perf-entry';

/**
 * Proposition de mise à jour des records (TLX-076, ADR-20) : candidats détectés par le
 * backend et validés épreuve par épreuve — la valeur est revalidée côté serveur depuis la
 * performance (jamais de valeur libre).
 *
 * Extraite de `PerfConfirmationScreen` (TLX-243). Cette carte n'y vivait que là, et cet écran
 * n'est atteignable que par le `router.replace` qui suit le **premier** enregistrement : un
 * athlète qui quittait sans valider n'avait plus aucun moyen de confirmer son record, alors
 * que le serveur continue de le proposer à chaque lecture de la performance. La carte ne
 * dépendant que de la performance, elle se pose partout où celle-ci est déjà chargée.
 */
export function RecordCandidatesCard({
  performance,
  title,
  testID = 'record-candidates',
}: {
  performance: Performance;
  /** Titre optionnel — le rattrapage ne s'annonce pas comme une détection à chaud. */
  title?: string;
  testID?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const candidates = performance.recordCandidates ?? [];

  const mutation = useMutation({
    mutationFn: async (candidate: RecordCandidate) => {
      const response = await confirmRecord(candidate.eventKey, {
        performanceId: performance.id,
      });
      if (response.status === 200) return response.data;
      throw response;
    },
    onSuccess: (record) => {
      setConfirmed((prev) => [...prev, record.eventKey]);
      void queryClient.invalidateQueries({ queryKey: ['records'] });
      toast.show({ title: 'Record enregistré !', variant: 'success' });
    },
    onError: () => {
      toast.show({ title: "Échec de l'enregistrement du record", variant: 'danger' });
    },
  });

  const heading = title ?? (candidates.length > 1 ? 'Nouveaux records ?' : 'Nouveau record ?');

  return (
    <Card testID={testID} style={{ backgroundColor: colors.accentSubtle }}>
      <View style={{ gap: spacing[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Feather name="award" size={18} color={colors.accentText} />
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.bold,
              fontSize: typography.body.fontSize,
            }}
          >
            {heading}
          </Text>
        </View>
        {candidates.map((candidate) => {
          const done = confirmed.includes(candidate.eventKey);
          return (
            <View
              key={candidate.eventKey}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  testID={`record-candidate-${candidate.eventKey}`}
                  style={{
                    color: colors.textPrimary,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.body.fontSize,
                  }}
                >
                  {candidate.label} — {formatRecordValue(candidate.value, candidate.unit)}
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.bodySm.fontSize,
                  }}
                >
                  {candidate.previousValue != null
                    ? `Ancien record : ${formatRecordValue(candidate.previousValue, candidate.unit)}`
                    : 'Première marque sur cette épreuve'}
                </Text>
              </View>
              {done ? (
                <Text
                  testID={`record-confirmed-${candidate.eventKey}`}
                  style={{
                    color: colors.success,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.bodySm.fontSize,
                  }}
                >
                  ✓ Validé
                </Text>
              ) : (
                <Button
                  testID={`record-confirm-${candidate.eventKey}`}
                  size="sm"
                  loading={mutation.isPending}
                  onPress={() => mutation.mutate(candidate)}
                >
                  Valider
                </Button>
              )}
            </View>
          );
        })}
      </View>
    </Card>
  );
}
