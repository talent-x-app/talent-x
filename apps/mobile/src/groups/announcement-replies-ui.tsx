import {
  createAnnouncementReply,
  deleteAnnouncementReply,
  listAnnouncementReplies,
  reportAnnouncementReply,
  type AnnouncementReply,
  type ReplyReportReason,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Button } from '../components/ui';
import { toUserMessage, useToast } from '../feedback';
import { formatRelativeDate } from '../notifications/notification-ui';
import { announcementRepliesQueryKey } from './groups-query';
import { TeammateAvatar, teammateName } from './teammate-avatar';

/**
 * Motifs de signalement (ADR-50 §D3) — bornés côté serveur (enum `ReplyReportReason`). Libellés
 * fr maîtrisés ici ; pas de dépendance runtime à l'enum généré, ordre d'affichage déterministe.
 */
const REPORT_REASONS: { value: ReplyReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'abuse', label: 'Abus' },
  { value: 'offensive', label: 'Offensant' },
  { value: 'other', label: 'Autre' },
];

/**
 * Fil de réponses sous une annonce (ADR-48 Palier 3 / ADR-50) — **bidirectionnel**. Chargé à la
 * demande (déplié). Affiche chaque réponse (auteur minimisé + date + corps), les actions de
 * modération (supprimer si `canDelete`, signaler sinon) et, pour le coach, le badge « masquée /
 * N signalements ». Zone de saisie en pied. Données via `…/announcements/:announcementId/replies`.
 */
export function ReplyThread({
  groupId,
  announcementId,
  now = new Date(),
}: {
  groupId: string;
  announcementId: string;
  now?: Date;
}) {
  const { colors, typography, spacing } = useTheme();

  const query = useQuery({
    queryKey: announcementRepliesQueryKey(groupId, announcementId),
    queryFn: async (): Promise<AnnouncementReply[]> => {
      const response = await listAnnouncementReplies(groupId, announcementId);
      if (response.status === 200) return response.data.data;
      throw response;
    },
    retry: false,
  });

  const replies = query.data ?? [];

  return (
    <View
      testID={`reply-thread-${announcementId}`}
      style={{ gap: spacing[2], marginTop: spacing[1] }}
    >
      {query.isLoading ? (
        <View testID={`replies-loading-${announcementId}`} style={{ paddingVertical: spacing[2] }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : query.isError ? (
        <Pressable testID={`replies-retry-${announcementId}`} onPress={() => void query.refetch()}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Impossible de charger le fil. Toucher pour réessayer.
          </Text>
        </Pressable>
      ) : (
        replies.map((reply) => (
          <ReplyRow key={reply.id} reply={reply} groupId={groupId} now={now} />
        ))
      )}

      <ReplyComposer groupId={groupId} announcementId={announcementId} />
    </View>
  );
}

/** Une réponse : auteur + date + corps, actions de modération (supprimer / signaler). */
function ReplyRow({
  reply,
  groupId,
  now,
}: {
  reply: AnnouncementReply;
  groupId: string;
  now: Date;
}) {
  const { colors, typography, spacing, radius } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);

  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: announcementRepliesQueryKey(groupId, reply.announcementId),
    });

  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await deleteAnnouncementReply(groupId, reply.announcementId, reply.id);
      if (response.status !== 204) throw response;
    },
    onSuccess: () => {
      invalidate();
      toast.show({ variant: 'success', title: 'Réponse supprimée' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const report = useMutation({
    mutationFn: async (reason: ReplyReportReason): Promise<void> => {
      const response = await reportAnnouncementReply(groupId, reply.announcementId, reply.id, {
        reason,
      });
      if (response.status !== 200) throw response;
    },
    onSuccess: () => {
      setReporting(false);
      invalidate();
      toast.show({ variant: 'success', title: 'Réponse signalée' });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  return (
    <View
      testID={`reply-${reply.id}`}
      style={{
        flexDirection: 'row',
        gap: spacing[2],
        opacity: reply.hidden ? 0.6 : 1,
      }}
    >
      <TeammateAvatar teammate={reply.author} size={28} testID={`reply-avatar-${reply.id}`} />
      <View style={{ flex: 1, gap: spacing[1] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Text
            style={{
              flex: 1,
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.caption.fontSize,
            }}
          >
            {teammateName(reply.author)} · {formatRelativeDate(reply.createdAt, now)}
          </Text>
          {reply.canDelete ? (
            <Pressable
              testID={`reply-delete-${reply.id}`}
              onPress={() => remove.mutate()}
              disabled={remove.isPending}
              accessibilityRole="button"
              accessibilityLabel="Supprimer la réponse"
              hitSlop={8}
            >
              <Feather name="trash-2" size={14} color={colors.textMuted} />
            </Pressable>
          ) : !reply.mine && !reply.reportedByMe ? (
            <Pressable
              testID={`reply-report-${reply.id}`}
              onPress={() => setReporting((o) => !o)}
              accessibilityRole="button"
              accessibilityLabel="Signaler la réponse"
              hitSlop={8}
            >
              <Feather name="flag" size={14} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <Text
          style={{
            color: reply.hidden ? colors.textMuted : colors.textPrimary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
            fontStyle: reply.hidden ? 'italic' : 'normal',
            lineHeight: 19,
          }}
        >
          {reply.body}
        </Text>

        {/* Badge modération (coach) : compteur de signalements quand exposé. */}
        {typeof reply.reportCount === 'number' && reply.reportCount > 0 ? (
          <Text
            testID={`reply-reports-${reply.id}`}
            style={{
              color: colors.danger,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.caption.fontSize,
            }}
          >
            {reply.hidden ? 'Masquée · ' : ''}
            {reply.reportCount} signalement{reply.reportCount > 1 ? 's' : ''}
          </Text>
        ) : reply.reportedByMe ? (
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.caption.fontSize,
            }}
          >
            Signalée
          </Text>
        ) : null}

        {/* Sélecteur de motif de signalement (enum borné serveur). */}
        {reporting ? (
          <View
            testID={`reply-report-reasons-${reply.id}`}
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1] }}
          >
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r.value}
                testID={`reply-report-${reply.id}-${r.value}`}
                onPress={() => report.mutate(r.value)}
                disabled={report.isPending}
                accessibilityRole="button"
                style={{
                  paddingHorizontal: spacing[2],
                  paddingVertical: spacing[1],
                  borderRadius: radius.pill,
                  backgroundColor: colors.surfaceSunken,
                }}
              >
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.medium,
                    fontSize: typography.caption.fontSize,
                  }}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Zone de saisie d'une réponse (coach et membres). */
function ReplyComposer({ groupId, announcementId }: { groupId: string; announcementId: string }) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const send = useMutation({
    mutationFn: async (): Promise<void> => {
      const response = await createAnnouncementReply(groupId, announcementId, {
        body: body.trim(),
      });
      if (response.status !== 201) throw response;
    },
    onSuccess: () => {
      setBody('');
      void queryClient.invalidateQueries({
        queryKey: announcementRepliesQueryKey(groupId, announcementId),
      });
    },
    onError: (error: unknown) => {
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
  });

  const trimmed = body.trim();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2] }}>
      <TextInput
        testID={`reply-input-${announcementId}`}
        value={body}
        onChangeText={setBody}
        placeholder="Répondre…"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={500}
        editable={!send.isPending}
        style={{
          flex: 1,
          minHeight: 38,
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
          backgroundColor: colors.surfaceSunken,
          borderRadius: radius.sm,
          borderWidth: borderWidth.hairline,
          borderColor: colors.border,
          paddingHorizontal: spacing[2],
          paddingVertical: spacing[2],
          textAlignVertical: 'top',
        }}
      />
      <Button
        testID={`reply-send-${announcementId}`}
        size="sm"
        disabled={trimmed.length === 0}
        loading={send.isPending}
        onPress={() => send.mutate()}
      >
        Envoyer
      </Button>
    </View>
  );
}
