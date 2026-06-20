import { getGroupTeammates, type GroupTeammate } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { groupTeammatesQueryKey } from './groups-query';

/**
 * Onglet **Coéquipiers** du hub de groupe (ADR-37) : roster pair-à-pair minimisé
 * (`GET /groups/:id/teammates`, nom + avatar, sans e-mail/perf/santé). Extrait de l'ancien écran
 * de détail pour réutilisation telle quelle dans le hub — comportement et testIDs préservés.
 */
export function TeammatesPane({ groupId }: { groupId: string }) {
  const { colors, typography, spacing } = useTheme();

  const teammates = useQuery({
    queryKey: groupTeammatesQueryKey(groupId),
    queryFn: async (): Promise<GroupTeammate[]> => {
      const response = await getGroupTeammates(groupId);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const roster = teammates.data ?? [];

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
        Coéquipiers{teammates.data ? ` (${roster.length})` : ''}
      </Text>

      {teammates.isLoading ? (
        <View testID="athlete-group-teammates-loading" style={{ paddingVertical: spacing[4] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : teammates.isError ? (
        <Card testID="athlete-group-teammates-error">
          <View style={{ gap: spacing[3] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger les coéquipiers.
            </Text>
            <Button testID="athlete-group-teammates-retry" onPress={() => void teammates.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : roster.length === 0 ? (
        <Card testID="athlete-group-teammates-empty">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            Tu es seul·e dans ce groupe pour l'instant.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {roster.map((teammate) => (
            <TeammateRow key={teammate.id} teammate={teammate} />
          ))}
        </View>
      )}
    </View>
  );
}

/** Ligne coéquipier : avatar (photo ou initiales) + nom. Vue minimisée (ADR-37). */
function TeammateRow({ teammate }: { teammate: GroupTeammate }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card testID={`athlete-group-teammate-${teammate.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        {teammate.avatarUrl ? (
          <Image
            testID={`athlete-group-teammate-${teammate.id}-avatar`}
            source={{ uri: teammate.avatarUrl }}
            style={{ width: 36, height: 36, borderRadius: 10 }}
          />
        ) : (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: colors.accentSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: colors.accentText,
                fontFamily: typography.fontFamily.bold,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              {teammateInitials(teammate)}
            </Text>
          </View>
        )}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          {teammateName(teammate)}
        </Text>
      </View>
    </Card>
  );
}

export function teammateName(teammate: GroupTeammate): string {
  const name = [teammate.firstName, teammate.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : 'Athlète';
}

function teammateInitials(teammate: GroupTeammate): string {
  const letters = [teammate.firstName?.[0], teammate.lastName?.[0]].filter(Boolean).join('');
  return (letters || '?').toUpperCase();
}
