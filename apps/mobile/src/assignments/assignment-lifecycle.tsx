import {
  AssignmentStatus,
  AssignmentUpdateRequestStatus,
  SkipReason,
  deleteAssignment,
  updateAssignment,
  type Assignment,
  type AssignmentUpdateRequest,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, Card, Chip } from '../components/ui';
import { COACH_DASHBOARD_QUERY_KEY } from '../dashboard/dashboard-query';
import { useToast } from '../feedback';

/** Libellés FR des motifs d'indisponibilité (ADR-31). */
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  [SkipReason.injury]: 'Blessure',
  [SkipReason.absence]: 'Absence',
  [SkipReason.weather]: 'Météo',
  [SkipReason.other]: 'Autre',
};

/** Ordre d'affichage des motifs. */
export const SKIP_REASON_ORDER: SkipReason[] = [
  SkipReason.injury,
  SkipReason.absence,
  SkipReason.weather,
  SkipReason.other,
];

/** Invalidations communes après une mutation de cycle de vie d'affectation. */
function useLifecycleInvalidate(assignmentId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    void queryClient.invalidateQueries({ queryKey: ['assignment', assignmentId] });
    void queryClient.invalidateQueries({ queryKey: COACH_DASHBOARD_QUERY_KEY });
  };
}

/**
 * Carte « Je ne peux pas faire cette séance » côté athlète (ADR-31 / TLX-108). L'athlète
 * signale une indisponibilité (`skipped` + motif) — la séance sort des retards du coach — et
 * peut revenir en arrière (`assigned`). Masquée sur une séance déjà réalisée (`completed`).
 */
export function SkipSessionCard({ assignment }: { assignment: Assignment }) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const invalidate = useLifecycleInvalidate(assignment.id);
  const [choosing, setChoosing] = useState(false);
  const [reason, setReason] = useState<SkipReason | null>(null);

  const mutation = useMutation({
    mutationFn: async (body: AssignmentUpdateRequest): Promise<Assignment> => {
      const res = await updateAssignment(assignment.id, body);
      if (res.status === 200) return res.data;
      throw res;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['assignment', assignment.id], updated);
      invalidate();
      setChoosing(false);
      setReason(null);
    },
    onError: () =>
      toast.show({
        title: 'Action impossible',
        description: 'Réessaie dans un instant.',
        variant: 'danger',
      }),
  });

  // Une séance réalisée ne se « saute » pas (la perf est enregistrée).
  if (assignment.status === AssignmentStatus.completed) return null;

  // Indispo déjà signalée : état + retour en arrière.
  if (assignment.status === AssignmentStatus.skipped) {
    const label = assignment.skipReason ? SKIP_REASON_LABELS[assignment.skipReason] : 'Indispo';
    return (
      <Card testID="skip-card-signaled" style={{ backgroundColor: colors.surfaceSunken }}>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Feather name="slash" size={18} color={colors.textSecondary} />
            <Text
              style={{
                flex: 1,
                color: colors.textSecondary,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Indisponibilité signalée · {label}
            </Text>
          </View>
          <Button
            testID="skip-undo"
            variant="ghost"
            loading={mutation.isPending}
            onPress={() => mutation.mutate({ status: AssignmentUpdateRequestStatus.assigned })}
          >
            Finalement, je peux la faire
          </Button>
        </View>
      </Card>
    );
  }

  if (!choosing) {
    return (
      <Button
        testID="skip-open"
        variant="ghost"
        onPress={() => setChoosing(true)}
        leftIcon={<Feather name="slash" size={18} color={colors.textSecondary} />}
      >
        Je ne peux pas faire cette séance
      </Button>
    );
  }

  return (
    <Card testID="skip-card">
      <View style={{ gap: spacing[3] }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          Pourquoi ne peux-tu pas faire cette séance ?
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {SKIP_REASON_ORDER.map((r) => (
            <Chip
              key={r}
              testID={`skip-reason-${r}`}
              selected={reason === r}
              onPress={() => setReason(r)}
            >
              {SKIP_REASON_LABELS[r]}
            </Chip>
          ))}
        </View>
        <Button
          testID="skip-confirm"
          disabled={reason === null}
          loading={mutation.isPending}
          onPress={() =>
            reason &&
            mutation.mutate({ status: AssignmentUpdateRequestStatus.skipped, skipReason: reason })
          }
        >
          Signaler mon indisponibilité
        </Button>
        <Button
          testID="skip-cancel"
          variant="ghost"
          disabled={mutation.isPending}
          onPress={() => {
            setChoosing(false);
            setReason(null);
          }}
        >
          Annuler
        </Button>
      </View>
    </Card>
  );
}

/**
 * Actions coach sur une affectation (ADR-31 / TLX-108) : **replanifier** (nouvelle échéance)
 * et **désassigner** (retrait soft). Réservé au coach propriétaire (le backend garde le RBAC).
 * Désassigner est interdit sur une séance réalisée (422) → message dédié.
 */
export function CoachAssignmentActions({
  assignment,
  onChanged,
}: {
  assignment: Assignment;
  onChanged?: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const toast = useToast();
  const invalidate = useLifecycleInvalidate(assignment.id);
  const [replanning, setReplanning] = useState(false);
  const [dueDate, setDueDate] = useState(assignment.dueDate ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const done = () => {
    invalidate();
    onChanged?.();
  };

  const replan = useMutation({
    mutationFn: async (): Promise<Assignment> => {
      const res = await updateAssignment(assignment.id, { dueDate: dueDate.trim() || null });
      if (res.status === 200) return res.data;
      throw res;
    },
    onSuccess: () => {
      toast.show({ title: 'Séance replanifiée', variant: 'success' });
      setReplanning(false);
      done();
    },
    onError: () => toast.show({ title: 'Échec de la replanification', variant: 'danger' }),
  });

  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await deleteAssignment(assignment.id);
      if (res.status === 204) return;
      throw res;
    },
    onSuccess: () => {
      toast.show({ title: 'Athlète désassigné', variant: 'success' });
      done();
    },
    onError: (error) => {
      const completed =
        (error as { data?: { error?: string } })?.data?.error === 'ASSIGNMENT_COMPLETED';
      toast.show({
        title: 'Désassignation impossible',
        description: completed
          ? 'Cette séance est déjà réalisée (performance enregistrée).'
          : 'Réessaie dans un instant.',
        variant: 'danger',
      });
      setConfirmingDelete(false);
    },
  });

  const busy = replan.isPending || remove.isPending;

  return (
    <View testID={`coach-assignment-actions-${assignment.id}`} style={{ gap: spacing[2] }}>
      {replanning ? (
        <View style={{ gap: spacing[2] }}>
          <TextInput
            testID="replan-date"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="AAAA-MM-JJ (vide = sans échéance)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={{
              height: 42,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              backgroundColor: colors.surface,
              paddingHorizontal: 12,
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.body.fontSize,
            }}
          />
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Button
              testID="replan-confirm"
              size="sm"
              loading={replan.isPending}
              onPress={() => replan.mutate()}
            >
              Valider
            </Button>
            <Button
              testID="replan-cancel"
              size="sm"
              variant="ghost"
              disabled={busy}
              onPress={() => setReplanning(false)}
            >
              Annuler
            </Button>
          </View>
        </View>
      ) : confirmingDelete ? (
        <View style={{ gap: spacing[2] }}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Retirer cette séance de l'athlète ?
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Button
              testID="unassign-confirm"
              size="sm"
              variant="danger"
              loading={remove.isPending}
              onPress={() => remove.mutate()}
            >
              Désassigner
            </Button>
            <Button
              testID="unassign-cancel"
              size="sm"
              variant="ghost"
              disabled={busy}
              onPress={() => setConfirmingDelete(false)}
            >
              Annuler
            </Button>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <Button
            testID="coach-replan-open"
            size="sm"
            variant="secondary"
            leftIcon={<Feather name="calendar" size={16} color={colors.textPrimary} />}
            onPress={() => setReplanning(true)}
          >
            Replanifier
          </Button>
          <Button
            testID="coach-unassign-open"
            size="sm"
            variant="ghost"
            leftIcon={<Feather name="user-x" size={16} color={colors.danger} />}
            onPress={() => setConfirmingDelete(true)}
          >
            Désassigner
          </Button>
        </View>
      )}
    </View>
  );
}
