import {
  addAnnouncementReaction,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  markAnnouncementRead,
  removeAnnouncementReaction,
  type GroupAnnouncement,
  type ReactionEmoji,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { formatRelativeDate } from '../notifications/notification-ui';
import { groupAnnouncementsQueryKey } from './groups-query';
import { TeamPulseCard } from './team-pulse-ui';
import { NarrativePresenceBanner } from './narrative-presence-ui';
import { TeammateAvatarStack, teammateFirstName } from './teammate-avatar';
import { ReplyThread } from './announcement-replies-ui';

/**
 * Palette d'emoji autorisés (ADR-48, Palier 1) — bornée côté API par une contrainte CHECK
 * (même ensemble que le schéma `ReactionEmoji`). Littéral local : pas de dépendance runtime à
 * l'enum généré, et l'ordre d'affichage est maîtrisé.
 */
const REACTION_EMOJIS: ReactionEmoji[] = ['❤️', '🔥', '👏', '💪', '😮'];

/**
 * Annonces de groupe (ADR-46) — canal descendant coach → membres. Composant **partagé** :
 * `canManage` (coach propriétaire) ajoute la zone de publication et la suppression ; sinon
 * lecture seule (athlète membre). Données via `GET/POST/DELETE /groups/:id/announcements`.
 * Enrichi du « Mur » (ADR-48, Palier 1) : pouls d'équipe + présence narrative (athlète, via
 * `coachId`) en tête, réactions et accusé de lecture sur chaque annonce.
 */
export function AnnouncementsPane({
  groupId,
  canManage = false,
  coachId,
  now = new Date(),
}: {
  groupId: string;
  canManage?: boolean;
  /** Coach du groupe — active la bannière de présence narrative côté athlète (ADR-48, slice 4). */
  coachId?: string;
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
      {/* Pouls d'équipe (ADR-48, Palier 1) : agrégat dérivé, silencieux si semaine creuse. */}
      <TeamPulseCard groupId={groupId} />

      {/* Présence narrative (athlète) : prochaine séance du groupe, silencieuse sinon. */}
      {!canManage && coachId ? <NarrativePresenceBanner coachId={coachId} now={now} /> : null}

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
              color: colors.textSecondary,
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

/**
 * Carte d'annonce : auteur + date relative + corps. Bouton supprimer si `canManage` (coach).
 * Pied de carte (ADR-48, Palier 1) : réactions emoji **agrégées** (compteurs + emoji de
 * l'appelant, jamais l'identité d'un tiers — patron ADR-45) et accusé de lecture agrégé
 * « X/Y lu ». Côté athlète, l'ouverture de l'onglet marque l'annonce comme lue.
 */
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
  const [showReplies, setShowReplies] = useState(false);

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

  // Marquage « lu » côté athlète (membre) à l'affichage. Idempotent côté API ; échec silencieux
  // (l'accusé de lecture est un bonus, pas un bloquant). Le coach est l'auteur → exclu.
  const { mutate: markRead } = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await markAnnouncementRead(groupId, announcement.id);
      if (response.status !== 200) throw response;
    },
  });
  useEffect(() => {
    if (canManage) return;
    // Un seul marquage par annonce et par montage (`mutate` est stable entre les rendus).
    markRead();
  }, [announcement.id, canManage, markRead]);

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

        <AnnouncementFooter announcement={announcement} groupId={groupId} />

        {/* Fil de réponses (ADR-48 Palier 3 / ADR-50) — déplié à la demande, chargé alors. */}
        <Pressable
          testID={`replies-toggle-${announcement.id}`}
          onPress={() => setShowReplies((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showReplies }}
          accessibilityLabel={showReplies ? 'Masquer le fil' : 'Répondre'}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[1],
            marginTop: spacing[1],
          }}
        >
          <Feather
            name={showReplies ? 'chevron-up' : 'message-circle'}
            size={14}
            color={colors.accentText}
          />
          <Text
            style={{
              color: colors.accentText,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {showReplies ? 'Masquer le fil' : 'Répondre'}
          </Text>
        </Pressable>

        {showReplies ? (
          <ReplyThread groupId={groupId} announcementId={announcement.id} now={now} />
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Pied de carte : pastilles de réaction (compteurs agrégés + état « la mienne »), bouton « + »
 * ouvrant un sélecteur d'emoji, et barre d'accusé de lecture « X/Y lu ». Réagir est togglable et
 * idempotent côté API ; on rafraîchit la liste pour relire les compteurs (jamais d'identité).
 */
function AnnouncementFooter({
  announcement,
  groupId,
}: {
  announcement: GroupAnnouncement;
  groupId: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const myReactions = new Set<ReactionEmoji>(announcement.myReactions);
  const counts = new Map(announcement.reactions.map((r) => [r.emoji, r.count]));

  const toggle = useMutation({
    mutationFn: async (emoji: ReactionEmoji): Promise<void> => {
      const mine = myReactions.has(emoji);
      const response = mine
        ? await removeAnnouncementReaction(groupId, announcement.id, emoji)
        : await addAnnouncementReaction(groupId, announcement.id, emoji);
      if (response.status !== 200) throw response;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: groupAnnouncementsQueryKey(groupId) });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const onPick = (emoji: ReactionEmoji) => {
    setPickerOpen(false);
    toggle.mutate(emoji);
  };

  // Emoji déjà présents (avec compteur) en premier, dans l'ordre de la palette.
  const active = REACTION_EMOJIS.filter((e) => (counts.get(e) ?? 0) > 0);
  const readRatio =
    announcement.memberCount > 0
      ? Math.min(1, announcement.readCount / announcement.memberCount)
      : 0;

  return (
    <View style={{ gap: spacing[2], marginTop: spacing[1] }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[2] }}
      >
        {active.map((emoji) => {
          const mine = myReactions.has(emoji);
          return (
            <Pressable
              key={emoji}
              testID={`reaction-${announcement.id}-${emoji}`}
              onPress={() => toggle.mutate(emoji)}
              disabled={toggle.isPending}
              accessibilityRole="button"
              accessibilityState={{ selected: mine }}
              accessibilityLabel={`Réagir ${emoji}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[1],
                height: 30,
                paddingHorizontal: spacing[2],
                borderRadius: radius.pill,
                borderWidth: borderWidth.hairline,
                borderColor: mine ? colors.accent : 'transparent',
                backgroundColor: mine ? colors.accentSubtle : colors.surfaceSunken,
              }}
            >
              <Text style={{ fontSize: typography.bodySm.fontSize }}>{emoji}</Text>
              <Text
                style={{
                  color: mine ? colors.accentText : colors.textSecondary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {counts.get(emoji)}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          testID={`reaction-add-${announcement.id}`}
          onPress={() => setPickerOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel="Ajouter une réaction"
          hitSlop={6}
          style={{
            width: 30,
            height: 30,
            borderRadius: radius.pill,
            borderWidth: borderWidth.hairline,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSunken,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={pickerOpen ? 'x' : 'smile'} size={15} color={colors.textSecondary} />
        </Pressable>

        <View style={{ flex: 1 }} />

        {announcement.memberCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <View
              style={{
                width: 44,
                height: 4,
                borderRadius: 2,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSunken,
              }}
            >
              <View
                testID={`read-bar-${announcement.id}`}
                style={{
                  width: `${Math.round(readRatio * 100)}%`,
                  height: '100%',
                  backgroundColor: colors.success,
                }}
              />
            </View>
            <Text
              testID={`read-count-${announcement.id}`}
              style={{
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.caption.fontSize,
              }}
            >
              {announcement.readCount}/{announcement.memberCount} lu
            </Text>
          </View>
        ) : null}
      </View>

      {/* Auteurs des réactions (ADR-49 D1) : pile d'avatars + prénoms, plafonnés serveur. */}
      {announcement.reactions.some((r) => r.reactors.length > 0) ? (
        <View style={{ gap: spacing[1] }}>
          {announcement.reactions
            .filter((r) => r.reactors.length > 0)
            .map((r) => {
              const extra = r.count - r.reactors.length;
              const names = r.reactors.map(teammateFirstName).join(', ');
              return (
                <View
                  key={r.emoji}
                  testID={`reactors-${announcement.id}-${r.emoji}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
                >
                  <Text style={{ fontSize: typography.caption.fontSize }}>{r.emoji}</Text>
                  <TeammateAvatarStack teammates={r.reactors} size={20} />
                  <Text
                    testID={`reactors-names-${announcement.id}-${r.emoji}`}
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      color: colors.textSecondary,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.caption.fontSize,
                    }}
                  >
                    {names}
                    {extra > 0 ? ` +${extra}` : ''}
                  </Text>
                </View>
              );
            })}
        </View>
      ) : null}

      {pickerOpen ? (
        <View
          testID={`reaction-picker-${announcement.id}`}
          style={{
            flexDirection: 'row',
            alignSelf: 'flex-start',
            gap: spacing[1],
            padding: spacing[1],
            borderRadius: radius.pill,
            borderWidth: borderWidth.hairline,
            borderColor: colors.border,
            backgroundColor: colors.surfaceSunken,
          }}
        >
          {REACTION_EMOJIS.map((emoji) => {
            const mine = myReactions.has(emoji);
            return (
              <Pressable
                key={emoji}
                testID={`reaction-pick-${announcement.id}-${emoji}`}
                onPress={() => onPick(emoji)}
                accessibilityRole="button"
                accessibilityState={{ selected: mine }}
                hitSlop={4}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: mine ? colors.accentSubtle : 'transparent',
                }}
              >
                <Text style={{ fontSize: typography.body.fontSize }}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
