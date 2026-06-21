import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  type GroupAnnouncement,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { formatRelativeDate } from '../notifications/notification-ui';
import { groupAnnouncementsQueryKey } from './groups-query';

/**
 * Annonces de groupe (ADR-46) — canal descendant coach → membres. Composant **partagé** :
 * `canManage` (coach propriétaire) ajoute la zone de publication et la suppression ; sinon
 * lecture seule (athlète membre). Données via `GET/POST/DELETE /groups/:id/announcements`.
 */
export function AnnouncementsPane({
  groupId,
  canManage = false,
  now = new Date(),
}: {
  groupId: string;
  canManage?: boolean;
  now?: Date;
}) {
  const { colors, typography, spacing } = useTheme();

  const query = useQuery({
    queryKey: groupAnnouncementsQueryKey(groupId),
    queryFn: async (): Promise<GroupAnnouncement[]> => {
      const response = await listAnnouncements(groupId);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const announcements = query.data ?? [];

  return (
    <View style={{ gap: spacing[4] }}>
      {canManage ? <ComposeAnnouncement groupId={groupId} /> : null}

      {query.isLoading ? (
        <View testID="announcements-loading" style={{ paddingVertical: spacing[4] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Card testID="announcements-error">
          <View style={{ gap: spacing[3] }}>
            <Text
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
                textAlign: 'center',
              }}
            >
              Impossible de charger les annonces.
            </Text>
            <Button testID="announcements-retry" onPress={() => void query.refetch()}>
              Réessayer
            </Button>
          </View>
        </Card>
      ) : announcements.length === 0 ? (
        <Card testID="announcements-empty">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
              textAlign: 'center',
            }}
          >
            {canManage
              ? 'Aucune annonce. Publie la première pour informer ton groupe.'
              : 'Aucune annonce pour l’instant.'}
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {announcements.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              groupId={groupId}
              canManage={canManage}
              now={now}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/** Zone de publication (coach) : champ multi-lignes + bouton Publier. */
function ComposeAnnouncement({ groupId }: { groupId: string }) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const publish = useMutation({
    mutationFn: async (): Promise<GroupAnnouncement> => {
      const response = await createAnnouncement(groupId, { body: body.trim() });
      if (response.status === 201) return response.data;
      throw response;
    },
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({ queryKey: groupAnnouncementsQueryKey(groupId) });
      toast.show({ variant: 'success', title: 'Annonce publiée' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const trimmed = body.trim();

  return (
    <Card>
      <View style={{ gap: spacing[3] }}>
        <TextInput
          testID="announcement-input"
          value={body}
          onChangeText={setBody}
          placeholder="Une info pour ton groupe (séance déplacée, compèt…)"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={1000}
          editable={!publish.isPending}
          style={{
            minHeight: 64,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.sm,
            borderWidth: borderWidth.hairline,
            borderColor: colors.border,
            padding: spacing[3],
            textAlignVertical: 'top',
          }}
        />
        <Button
          testID="announcement-publish"
          fullWidth
          disabled={trimmed.length === 0}
          loading={publish.isPending}
          onPress={() => publish.mutate()}
        >
          Publier
        </Button>
      </View>
    </Card>
  );
}

/** Carte d'annonce : auteur + date relative + corps ; bouton supprimer si `canManage`. */
function AnnouncementCard({
  announcement,
  groupId,
  canManage,
  now,
}: {
  announcement: GroupAnnouncement;
  groupId: string;
  canManage: boolean;
  now: Date;
}) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await deleteAnnouncement(groupId, announcement.id);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupAnnouncementsQueryKey(groupId) });
      toast.show({ variant: 'success', title: 'Annonce supprimée' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const author = [announcement.author.firstName, announcement.author.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return (
    <Card testID={`announcement-${announcement.id}`}>
      <View style={{ gap: spacing[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Feather name="volume-2" size={14} color={colors.accentText} />
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {author || 'Coach'} · {formatRelativeDate(announcement.createdAt, now)}
          </Text>
          {canManage ? (
            <Pressable
              testID={`announcement-delete-${announcement.id}`}
              onPress={() => remove.mutate()}
              disabled={remove.isPending}
              accessibilityRole="button"
              accessibilityLabel="Supprimer l'annonce"
              hitSlop={8}
            >
              <Feather name="trash-2" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.body.fontSize,
            lineHeight: 21,
          }}
        >
          {announcement.body}
        </Text>
      </View>
    </Card>
  );
}
