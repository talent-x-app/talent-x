import { getMyProgress, type Progress } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { PersonalRecordsSection } from './PersonalRecordsSection';
import { ProgressMetricsRow, ProgressSeriesCard, ProgressWindowChips } from './progress-charts';
import { type ProgressWindow } from './progress-series';

/** Réponse 403 dont le code métier indique un consentement manquant. */
function isConsentRequired(error: unknown): boolean {
  const e = error as { status?: number; data?: { error?: string } } | undefined;
  return e?.status === 403 && e?.data?.error === 'CONSENT_REQUIRED';
}

/**
 * Écran Progression athlète (A-06 — TLX-090, ADR-21) : métriques dérivées + un graphe
 * par épreuve (`GET /athletes/me/progress`), fenêtre Semaine/Mois/Année côté client,
 * puis records personnels (A-07). États chargement / consentement / erreur / vide.
 */
export function ProgressScreen() {
  const { colors, typography, spacing } = useTheme();
  const [window, setWindow] = useState<ProgressWindow>('month');

  const progress = useQuery({
    queryKey: ['progress', 'me'],
    queryFn: async (): Promise<Progress> => {
      const response = await getMyProgress();
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing[6], gap: spacing[5] }}
    >
      <View style={{ gap: spacing[1] }}>
        <Text
          testID="progress-title"
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.h2.fontSize,
          }}
        >
          Progression
        </Text>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          Tes marques et ta régularité, épreuve par épreuve.
        </Text>
      </View>

      {progress.isLoading ? (
        <View testID="progress-loading" style={{ paddingVertical: spacing[6] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : progress.isError ? (
        <Card testID={isConsentRequired(progress.error) ? 'progress-consent' : 'progress-error'}>
          <View style={{ gap: spacing[4] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              {isConsentRequired(progress.error)
                ? 'Active le consentement « traitement des données » pour voir ta progression.'
                : 'Impossible de charger ta progression.'}
            </Text>
            {!isConsentRequired(progress.error) ? (
              <Button testID="progress-retry" onPress={() => void progress.refetch()}>
                Réessayer
              </Button>
            ) : null}
          </View>
        </Card>
      ) : progress.data ? (
        <>
          <ProgressMetricsRow progress={progress.data} />

          {/* Fenêtre temporelle (ADR-21 : segmentation côté client). */}
          <ProgressWindowChips window={window} onChange={setWindow} />

          {progress.data.series.length === 0 ? (
            <Card testID="progress-empty">
              <View style={{ alignItems: 'center', gap: spacing[2] }}>
                <Feather name="trending-up" size={22} color={colors.textMuted} />
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.body.fontSize,
                    textAlign: 'center',
                  }}
                >
                  Pas encore de mesures — saisis tes perfs sur des blocs typés renseignés par ton
                  coach (sprint/course avec distance, lancer avec poids d'engin, hauteur/perche)
                  pour voir tes courbes.
                </Text>
              </View>
            </Card>
          ) : (
            progress.data.series.map((series) => (
              <ProgressSeriesCard key={series.eventKey} series={series} window={window} />
            ))
          )}

          <PersonalRecordsSection />
        </>
      ) : null}
    </ScrollView>
  );
}
