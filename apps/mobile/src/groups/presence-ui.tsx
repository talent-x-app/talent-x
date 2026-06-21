import {
  getAttendanceSummary,
  setAttendance,
  type AttendanceStatus,
  type AttendanceSummary,
  type SkipReason,
  type Assignment,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { attendanceDeadlineHours } from '../config/env';
import { toUserMessage, useToast } from '../feedback';
import { ASSIGNMENTS_QUERY_KEY, assignmentQueryKey } from './groups-query';

/**
 * Échéance de réponse de présence (ADR-43 §1) : `dueDate` − `hours`, **dérivée** (jamais stockée).
 * `null` si pas d'échéance ou date invalide.
 */
function attendanceDeadline(dueDate: string | undefined, hours: number): Date | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return new Date(due.getTime() - hours * 3600_000);
}

/**
 * Contrôle de **présence** (RSVP, ADR-43 §1, Phase B) — 3 états déclaratifs Présent / Absent /
 * Peut-être, **orthogonaux** au statut d'exécution (ADR-31). Écrit via `PUT /assignments/:id/
 * attendance` en **optimiste** (mise à jour immédiate du cache détail) avec **rollback + toast** en
 * cas d'échec. « Absent » exige un motif (invariant serveur) → sélecteur de motif inline.
 * L'échéance de réponse est **dérivée** (`dueDate` − délai `.env`), affichée tant que sans réponse.
 */

const GOING = 'going' as AttendanceStatus;
const NOT_GOING = 'not_going' as AttendanceStatus;
const MAYBE = 'maybe' as AttendanceStatus;

const ATT_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { value: GOING, label: 'Présent', icon: 'check' },
  { value: NOT_GOING, label: 'Absent', icon: 'x' },
  { value: MAYBE, label: 'Peut-être', icon: 'help-circle' },
];

const REASONS: { value: SkipReason; label: string }[] = [
  { value: 'injury' as SkipReason, label: 'Blessure' },
  { value: 'absence' as SkipReason, label: 'Indisponible' },
  { value: 'weather' as SkipReason, label: 'Météo' },
  { value: 'other' as SkipReason, label: 'Autre' },
];

export function PresenceControl({
  assignment,
  now = new Date(),
  queryKey,
}: {
  assignment: Assignment;
  now?: Date;
  /** Clé du cache de l'affectation à mettre à jour en optimiste (défaut : `['assignments', id]`).
   *  Le détail séance (`SessionDetailScreen`) la passe (`['assignment', id]`) pour aligner. */
  queryKey?: readonly unknown[];
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reasonOpen, setReasonOpen] = useState(false);

  const key = queryKey ?? assignmentQueryKey(assignment.id);

  const mutation = useMutation({
    mutationFn: async (input: { attendance: AttendanceStatus; reason?: SkipReason }) => {
      const response = await setAttendance(assignment.id, {
        attendance: input.attendance,
        reason: input.reason,
      });
      if (response.status === 200) return response.data;
      throw response;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Assignment>(key);
      queryClient.setQueryData<Assignment>(key, (old) =>
        old
          ? {
              ...old,
              attendance: input.attendance,
              attendanceReason: input.attendance === NOT_GOING ? input.reason : undefined,
            }
          : old,
      );
      return { previous };
    },
    onError: (error: unknown, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      const { title, description } = toUserMessage(error);
      toast.show({ variant: 'danger', title, description });
    },
    onSuccess: () => {
      toast.show({ variant: 'success', title: 'Présence enregistrée' });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      void queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_QUERY_KEY });
    },
  });

  const current = assignment.attendance;
  const deadline = attendanceDeadline(assignment.dueDate, attendanceDeadlineHours);
  const showDeadline = current == null && deadline != null && deadline.getTime() > now.getTime();

  const onPick = (value: AttendanceStatus) => {
    if (value === NOT_GOING) {
      setReasonOpen(true);
      return;
    }
    setReasonOpen(false);
    mutation.mutate({ attendance: value });
  };

  return (
    <View style={{ gap: spacing[3] }} testID="presence-control">
      <Text
        style={{
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.bodySm.fontSize,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Seras-tu présent ?
      </Text>

      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {ATT_OPTIONS.map((opt) => {
          const selected = current === opt.value;
          const tone =
            opt.value === GOING
              ? colors.success
              : opt.value === NOT_GOING
                ? colors.danger
                : colors.warning;
          const bg =
            opt.value === GOING
              ? colors.successBg
              : opt.value === NOT_GOING
                ? colors.dangerBg
                : colors.warningBg;
          return (
            <Pressable
              key={opt.value}
              testID={`presence-${opt.value}`}
              onPress={() => onPick(opt.value)}
              disabled={mutation.isPending}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={opt.label}
              style={{
                flex: 1,
                minHeight: 44,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing[1],
                borderRadius: radius.md,
                borderWidth: borderWidth.hairline,
                borderColor: selected ? 'transparent' : colors.border,
                backgroundColor: selected ? bg : colors.surfaceRaised,
              }}
            >
              <Feather name={opt.icon} size={15} color={selected ? tone : colors.textSecondary} />
              <Text
                style={{
                  color: selected ? tone : colors.textPrimary,
                  fontFamily: typography.fontFamily.medium,
                  fontSize: typography.bodySm.fontSize,
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Sélecteur de motif (invariant serveur : requis pour « Absent »). */}
      {reasonOpen || current === NOT_GOING ? (
        <View style={{ gap: spacing[2] }} testID="presence-reasons">
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.caption.fontSize,
            }}
          >
            Motif de l'absence
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {REASONS.map((r) => {
              const selected = current === NOT_GOING && assignment.attendanceReason === r.value;
              return (
                <Pressable
                  key={r.value}
                  testID={`presence-reason-${r.value}`}
                  onPress={() => mutation.mutate({ attendance: NOT_GOING, reason: r.value })}
                  disabled={mutation.isPending}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={r.label}
                  style={{
                    minHeight: 36,
                    justifyContent: 'center',
                    paddingHorizontal: spacing[3],
                    borderRadius: radius.pill,
                    borderWidth: borderWidth.hairline,
                    borderColor: selected ? 'transparent' : colors.border,
                    backgroundColor: selected ? colors.dangerBg : colors.surfaceRaised,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? colors.danger : colors.textPrimary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.caption.fontSize,
                    }}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {showDeadline ? (
        <Text
          testID="presence-deadline"
          style={{
            color: colors.warning,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.caption.fontSize,
          }}
        >
          À confirmer avant le{' '}
          {deadline.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Ligne d'**agrégat de présence** de la séance (ADR-45) — « X présents · Y absents · Z sans
 * réponse ». **Compteurs seuls** (RGPD, ADR-43 §5 ; jamais de noms). Masquée si l'agrégat n'a pas
 * de sens (`total ≤ 1`, séance individuelle) ou en chargement/erreur. La clé de cache
 * `['assignment', id, 'attendance-summary']` est invalidée par préfixe quand `PresenceControl`
 * déclare une présence → l'agrégat se rafraîchit tout seul.
 */
export function AttendanceSummaryView({ assignmentId }: { assignmentId: string }) {
  const { colors, typography, spacing } = useTheme();
  const query = useQuery({
    queryKey: ['assignment', assignmentId, 'attendance-summary'],
    queryFn: async (): Promise<AttendanceSummary> => {
      const response = await getAttendanceSummary(assignmentId);
      if (response.status === 200) return response.data;
      throw response;
    },
    retry: false,
  });

  const s = query.data;
  if (!s || s.total <= 1) return null;

  const parts: { key: string; label: string; color: string }[] = [
    { key: 'going', label: `${s.going} présent${s.going > 1 ? 's' : ''}`, color: colors.success },
    {
      key: 'notGoing',
      label: `${s.notGoing} absent${s.notGoing > 1 ? 's' : ''}`,
      color: colors.danger,
    },
    { key: 'maybe', label: `${s.maybe} peut-être`, color: colors.warning },
    {
      key: 'noResponse',
      label: `${s.noResponse} sans réponse`,
      color: colors.textMuted,
    },
  ];

  return (
    <View
      testID="attendance-summary"
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[2] }}
    >
      {parts.map((p) => (
        <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.color }} />
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.caption.fontSize,
            }}
          >
            {p.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
