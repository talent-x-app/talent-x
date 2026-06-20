import { useTheme } from '@talent-x/design-tokens';
import { View } from 'react-native';
import { Button, Card } from '../components/ui';
import { Text } from 'react-native';

/**
 * États transverses du hub de groupe (chargement / erreur) — partagés par les onglets Séances et
 * Calendrier. Le chargement est un **skeleton** (pas un spinner brut, cohérent maquette).
 */

/** Bloc skeleton (placeholder neutre). */
function SkeletonBlock({
  height,
  width = '100%',
}: {
  height: number;
  width?: number | `${number}%`;
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        height,
        width,
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceRaised,
      }}
    />
  );
}

/** Skeleton de fil de séances (carte next-up + deux lignes). */
export function FeedSkeleton({ testID }: { testID?: string }) {
  const { spacing } = useTheme();
  return (
    <View testID={testID} style={{ gap: spacing[4] }}>
      <Card>
        <View style={{ gap: spacing[3] }}>
          <SkeletonBlock height={12} width="40%" />
          <SkeletonBlock height={20} width="70%" />
          <SkeletonBlock height={12} width="90%" />
        </View>
      </Card>
      <SkeletonBlock height={64} />
      <SkeletonBlock height={64} />
    </View>
  );
}

/** État d'erreur avec réessai. */
export function FeedError({
  testID,
  message,
  onRetry,
}: {
  testID?: string;
  message: string;
  onRetry: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card testID={testID}>
      <View style={{ gap: spacing[4] }}>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
            textAlign: 'center',
          }}
        >
          {message}
        </Text>
        <Button testID={testID ? `${testID}-retry` : undefined} onPress={onRetry}>
          Réessayer
        </Button>
      </View>
    </Card>
  );
}
