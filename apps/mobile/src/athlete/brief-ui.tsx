import { type Exercise, type SessionBrief } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/ui';
import { countLeaves, isExerciseGroup, type ExerciseNode } from '../sessions/exercises-doc';

/**
 * Rendu athlète de la couche éditoriale `brief` (ADR-28) : en-tête de métriques
 * (Durée · Exercices · Difficulté), consigne « en une phrase », carte « Réussi si /
 * Stop si ». Les champs coach-only (`intent`, `coachNotes`) sont retirés **au serveur**
 * (mapper role-aware) et n'arrivent donc jamais ici.
 */

/** Durée tenue d'un exercice (feuille) : (durée + repos) × séries (1 si non précisé). */
function leafDurationSeconds(ex: Exercise): number {
  const sets = ex.sets && ex.sets > 0 ? ex.sets : 1;
  return ((ex.durationSeconds ?? 0) + (ex.restSeconds ?? 0)) * sets;
}

/**
 * Estimation de durée dérivée des blocs (ADR-28, règle 4) quand le coach n'a pas saisi
 * `durationMinutes` : somme des durées tenues + récupérations. C'est un **plancher** (les
 * blocs en répétitions sans durée n'ajoutent rien) — d'où le marquage « estimée ». Pour un
 * **groupe** (ADR-27), la durée d'un tour × `rounds` + récup r intra-tour et R inter-tours.
 */
export function estimateDurationMinutes(items: ExerciseNode[]): number {
  const seconds = (items ?? []).reduce((total, node) => {
    if (isExerciseGroup(node)) {
      const members = node.items ?? [];
      const rounds = node.rounds && node.rounds > 0 ? node.rounds : 1;
      const work = members.reduce((s, m) => s + leafDurationSeconds(m), 0);
      const intra = (node.restBetweenItemsSeconds ?? 0) * Math.max(members.length - 1, 0);
      const inter = (node.restBetweenRoundsSeconds ?? 0) * Math.max(rounds - 1, 0);
      return total + (work + intra) * rounds + inter;
    }
    return total + leafDurationSeconds(node);
  }, 0);
  return Math.round(seconds / 60);
}

/** Libellé de durée : valeur du brief si saisie, sinon estimation marquée « estimée ». */
export function durationMetric(
  brief: SessionBrief | undefined,
  items: ExerciseNode[],
): { value: string; hint?: string } {
  if (brief?.durationMinutes != null) {
    return { value: `${brief.durationMinutes} min` };
  }
  const estimated = estimateDurationMinutes(items);
  if (estimated <= 0) return { value: '—' };
  return { value: `~${estimated} min`, hint: 'estimée' };
}

function Metric({
  icon,
  label,
  value,
  hint,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  hint?: string;
  testID?: string;
}) {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: colors.surfaceSunken,
        borderRadius: radius.md,
        paddingVertical: spacing[3],
        paddingHorizontal: spacing[2],
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Feather name={icon} size={16} color={colors.textMuted} />
      <Text
        style={{
          color: colors.textMuted,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.caption.fontSize,
        }}
      >
        {label}
      </Text>
      <Text
        testID={testID ? `${testID}-value` : undefined}
        style={{
          color: colors.textPrimary,
          fontFamily: typography.fontFamily.bold,
          fontSize: typography.body.fontSize,
        }}
      >
        {value}
      </Text>
      {hint ? (
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.caption.fontSize,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** En-tête de métriques (kit UI `WorkoutScreen`) : Durée · Exercices · Difficulté. */
export function BriefMetrics({
  brief,
  items,
}: {
  brief: SessionBrief | undefined;
  items: ExerciseNode[];
}) {
  const { spacing } = useTheme();
  const duration = durationMetric(brief, items);
  return (
    <View testID="brief-metrics" style={{ flexDirection: 'row', gap: spacing[2] }}>
      <Metric
        testID="brief-metric-duration"
        icon="clock"
        label="Durée"
        value={duration.value}
        hint={duration.hint}
      />
      <Metric
        testID="brief-metric-exercises"
        icon="list"
        label="Exercices"
        value={`${countLeaves(items)}`}
      />
      <Metric
        testID="brief-metric-difficulty"
        icon="bar-chart-2"
        label="Difficulté"
        value={brief?.difficulty != null ? `${brief.difficulty}/10` : '—'}
      />
    </View>
  );
}

/** Consigne « 💡 En une phrase » (athleteIntent), sous le titre. */
export function AthleteIntentBanner({ text }: { text: string }) {
  const { colors, typography, spacing, radius } = useTheme();
  return (
    <View
      testID="brief-athlete-intent"
      style={{
        flexDirection: 'row',
        gap: spacing[3],
        alignItems: 'flex-start',
        backgroundColor: colors.accentSubtle,
        borderRadius: radius.md,
        padding: spacing[4],
      }}
    >
      <Feather name="zap" size={18} color={colors.accentText} />
      <Text
        style={{
          flex: 1,
          color: colors.accentText,
          fontFamily: typography.fontFamily.medium,
          fontSize: typography.body.fontSize,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

/** Carte « ✅ Réussi si / ⚠️ Stop si » — au-dessus de la soumission de perf. */
export function SuccessStopCard({
  successCriteria,
  stopCriteria,
}: {
  successCriteria?: string;
  stopCriteria?: string;
}) {
  const { colors } = useTheme();
  if (!successCriteria && !stopCriteria) return null;
  return (
    <Card testID="brief-success-stop" padded={false}>
      {successCriteria ? (
        <CriterionRow
          testID="brief-success"
          icon="check-circle"
          label="Réussi si"
          text={successCriteria}
          accent={colors.success}
          border={false}
        />
      ) : null}
      {stopCriteria ? (
        <CriterionRow
          testID="brief-stop"
          icon="alert-triangle"
          label="Stop si"
          text={stopCriteria}
          accent={colors.warning}
          border={Boolean(successCriteria)}
        />
      ) : null}
    </Card>
  );
}

function CriterionRow({
  icon,
  label,
  text,
  accent,
  border,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  text: string;
  accent: string;
  border: boolean;
  testID?: string;
}) {
  const { colors, typography } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.criterion,
        { borderLeftColor: accent, borderTopColor: colors.border, borderTopWidth: border ? 1 : 0 },
      ]}
    >
      <Feather name={icon} size={16} color={accent} />
      <Text
        style={{
          flex: 1,
          color: colors.textSecondary,
          fontFamily: typography.fontFamily.regular,
          fontSize: typography.bodySm.fontSize,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontFamily: typography.fontFamily.medium }}>
          {label}
        </Text>
        {' — '}
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  criterion: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderLeftWidth: 3,
  },
});
