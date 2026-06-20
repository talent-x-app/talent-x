import { setAttendance, AttendanceStatus, SkipReason, type Assignment } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { attendanceDeadlineHours } from '../config/env';
import { toUserMessage, useToast } from '../feedback';
import { ASSIGNMENTS_QUERY_KEY, assignmentQueryKey } from './groups-query';
import { attendanceDeadline } from './group-feed';

/**
 * Contrôle de **présence** (RSVP, ADR-43 §1, Phase B) — 3 états déclaratifs Présent / Absent /
 * Peut-être, **orthogonaux** au statut d'exécution (ADR-31). Écrit via `PUT /assignments/:id/
 * attendance` en **optimiste** (mise à jour immédiate du cache détail) avec **rollback + toast** en
 * cas d'échec. « Absent » exige un motif (invariant serveur) → sélecteur de motif inline.
 * L'échéance de réponse est **dérivée** (`dueDate` − délai `.env`), affichée tant que sans réponse.
 */

const ATT_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  icon: keyof typeof Feather.glyphMap;
}[] = [
  { value: AttendanceStatus.going, label: 'Présent', icon: 'check' },
  { value: AttendanceStatus.not_going, label: 'Absent', icon: 'x' },
  { value: AttendanceStatus.maybe, label: 'Peut-être', icon: 'help-circle' },
];

const REASONS: { value: SkipReason; label: string }[] = [
  { value: SkipReason.injury, label: 'Blessure' },
  { value: SkipReason.absence, label: 'Indisponible' },
  { value: SkipReason.weather, label: 'Météo' },
  { value: SkipReason.other, label: 'Autre' },
];

export function PresenceControl({
  assignment,
  now = new Date(),
}: {
  assignment: Assignment;
  now?: Date;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reasonOpen, setReasonOpen] = useState(false);

  const key = assignmentQueryKey(assignment.id);

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
              attendanceReason:
                input.attendance === AttendanceStatus.not_going ? input.reason : undefined,
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
    if (value === AttendanceStatus.not_going) {
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
            opt.value === AttendanceStatus.going
              ? colors.success
              : opt.value === AttendanceStatus.not_going
                ? colors.danger
                : colors.warning;
          const bg =
            opt.value === AttendanceStatus.going
              ? colors.successBg
              : opt.value === AttendanceStatus.not_going
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
      {reasonOpen || current === AttendanceStatus.not_going ? (
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
              const selected =
                current === AttendanceStatus.not_going && assignment.attendanceReason === r.value;
              return (
                <Pressable
                  key={r.value}
                  testID={`presence-reason-${r.value}`}
                  onPress={() =>
                    mutation.mutate({ attendance: AttendanceStatus.not_going, reason: r.value })
                  }
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
