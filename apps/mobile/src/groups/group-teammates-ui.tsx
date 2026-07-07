import {
  getGroupTeammates,
  getMe,
  type GroupTeammate,
  type User,
  type UserSummary,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { formatSessionDate } from '../athlete/athlete-session-ui';
import { groupTeammatesQueryKey } from './groups-query';

/** Clé du profil courant — partagée avec Accueil/Profil (cache `['me']`), sans tirer leur graphe UI. */
const ME_QUERY_KEY = ['me'] as const;

/**
 * Onglet **Coéquipiers** du hub de groupe (ADR-37, enrichi ADR-44 §5/§6 suivi UX) : carte **« Ton
 * coach »** en tête, date d'adhésion du membre, puis le roster pair-à-pair minimisé
 * (`GET /groups/:id/teammates`, nom + avatar). L'athlète courant est **exclu** de la liste des
 * coéquipiers (il n'est pas son propre coéquipier) — identité lue via le cache `['me']`.
 */
export function TeammatesPane({
  groupId,
  coach,
  joinedAt,
}: {
  groupId: string;
  coach?: UserSummary;
  joinedAt?: string;
}) {
  const { colors, typography, spacing } = useTheme();

  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<User> => {
      const response = await getMe();
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const teammates = useQuery({
    queryKey: groupTeammatesQueryKey(groupId),
    queryFn: async (): Promise<GroupTeammate[]> => {
      const response = await getGroupTeammates(groupId);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  // Le roster inclut l'appelant (ADR-37) : on le retire pour ne montrer que les *coéquipiers*.
  const others = (teammates.data ?? []).filter((t) => t.id !== me.data?.id);

  return (
    <View style={{ gap: spacing[5] }}>
      {coach ? <CoachCard coach={coach} /> : null}

      {joinedAt ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Feather name="calendar" size={13} color={colors.textMuted} />
          <Text
            testID="athlete-group-joined-at"
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Membre depuis le {formatSessionDate(joinedAt)}
          </Text>
        </View>
      ) : null}

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
          Coéquipiers{teammates.data ? ` (${others.length})` : ''}
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
              <Button
                testID="athlete-group-teammates-retry"
                onPress={() => void teammates.refetch()}
              >
                Réessayer
              </Button>
            </View>
          </Card>
        ) : others.length === 0 ? (
          <Card testID="athlete-group-teammates-empty">
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Tu es seul·e avec ton coach pour l'instant. Les coéquipiers apparaîtront ici dès
              qu'ils rejoindront le groupe.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: spacing[2] }}>
            {others.map((teammate) => (
              <TeammateRow key={teammate.id} teammate={teammate} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/** Carte « Ton coach » (ADR-44 suivi UX) : avatar initiales + nom + libellé de rôle. */
function CoachCard({ coach }: { coach: UserSummary }) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card testID="athlete-group-coach">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
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
            {personInitials(coach.firstName, coach.lastName)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.caption.fontSize,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Ton coach
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {personName(coach.firstName, coach.lastName, 'ton coach')}
          </Text>
        </View>
        <Feather name="award" size={18} color={colors.textMuted} />
      </View>
    </Card>
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
              {personInitials(teammate.firstName, teammate.lastName)}
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
          {personName(teammate.firstName, teammate.lastName, 'Athlète')}
        </Text>
      </View>
    </Card>
  );
}

export function teammateName(teammate: GroupTeammate): string {
  return personName(teammate.firstName, teammate.lastName, 'Athlète');
}

function personName(first: string | undefined, last: string | undefined, fallback: string): string {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : fallback;
}

function personInitials(first: string | undefined, last: string | undefined): string {
  const letters = [first?.[0], last?.[0]].filter(Boolean).join('');
  return (letters || '?').toUpperCase();
}
