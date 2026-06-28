import {
  type Exercise,
  type ExerciseGroup,
  type ExerciseResult,
  type SessionBrief,
} from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Card } from '../components/ui';
import { AthleteIntentBanner, BriefMetrics, SuccessStopCard } from '../athlete/brief-ui';
import { formatMeasures } from '../athlete/perf-entry';
import { formatExerciseTarget } from './exercise-target';
import {
  exerciseRenderRows,
  resultForLeaf,
  splitPhases,
  type ExerciseNode,
  type ExerciseRenderRow,
} from './exercises-doc';
import { formatDistanceVolume, sessionKpis, sessionPhrase } from './session-summary';

/**
 * Rendu **lecture seule** d'une séance (groupes v3 ADR-27 + brief ADR-28) — composant pur
 * partagé entre la consultation athlète (A-03, mode vue par défaut) et l'aperçu coach. Aucune
 * logique réseau ni état : tout vient des props. La saisie de perf (cases, RPE, soumission)
 * reste dans `SessionDetailScreen` ; ici on ne fait qu'**afficher** la prescription, et les
 * **mesures relues** si une perf est fournie (jointure `order` d'abord, ADR-27).
 */

/** Titre de section (capitales, espacé) — partagé avec la saisie. */
export function SectionTitle({ children, testID }: { children: ReactNode; testID?: string }) {
  const { colors, typography } = useTheme();
  return (
    <Text
      testID={testID}
      style={{
        color: colors.textSecondary,
        fontFamily: typography.fontFamily.medium,
        fontSize: typography.bodySm.fontSize,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
    >
      {children}
    </Text>
  );
}

/** En-tête d'un groupe d'exercices (ADR-27) : nom · N tours · R inter-tours. */
export function GroupHeader({
  group,
  divider,
  testID,
}: {
  group: ExerciseGroup;
  divider: boolean;
  testID?: string;
}) {
  const { colors, typography, spacing } = useTheme();
  const rounds = group.rounds && group.rounds > 0 ? group.rounds : 1;
  const rest = group.restBetweenRoundsSeconds ? ` · R ${group.restBetweenRoundsSeconds}s` : '';
  return (
    <View
      testID={testID}
      style={{
        gap: spacing[1],
        paddingVertical: 10,
        paddingHorizontal: 14,
        backgroundColor: colors.surfaceSunken,
        borderTopColor: colors.border,
        borderTopWidth: divider ? 1 : 0,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
        <Feather name="repeat" size={14} color={colors.textMuted} />
        <Text
          style={{
            flex: 1,
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {group.name}
        </Text>
        <Text
          testID={testID ? `${testID}-rounds` : undefined}
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {rounds} tours{rest}
        </Text>
      </View>
      {/* Consigne d'exécution du groupe (TLX-170) — affichée si renseignée. */}
      {group.notes ? (
        <Text
          testID={testID ? `${testID}-notes` : undefined}
          style={{
            color: colors.textMuted,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.caption.fontSize,
          }}
        >
          {group.notes}
        </Text>
      ) : null}
    </View>
  );
}

/** Libellé de l'état réalisé d'une feuille à partir de sa perf (mesures ou tours cochés). */
function realizedLabel(result: ExerciseResult | undefined): string | undefined {
  if (!result) return undefined;
  const measures = formatMeasures(result.setResults);
  if (measures) return measures;
  const sets = result.setResults ?? [];
  const done = sets.filter((s) => s.completed).length;
  if (sets.length > 1) return `${done}/${sets.length} tours`;
  return done > 0 ? 'Réalisé' : 'Non réalisé';
}

/**
 * Une feuille (exercice) en **lecture seule** : nom (+ libellé A1/A2 superset, indenté si
 * membre de groupe), cible dérivée des params (TLX-062). Si une perf est fournie, l'état
 * réalisé / les mesures relues s'affichent en regard.
 */
function ReadOnlyLeafRow({
  row,
  result,
  divider,
}: {
  row: Extract<ExerciseRenderRow, { type: 'leaf' }>;
  result: ExerciseResult | undefined;
  divider: boolean;
}) {
  const { colors, typography, spacing } = useTheme();
  const ex = row.exercise;
  const superset = row.group?.groupType === 'superset';
  const name = superset && row.memberLabel ? `${row.memberLabel} · ${ex.name}` : ex.name;
  const paddingLeft = 14 + (row.group ? spacing[4] : 0);
  const target = formatExerciseTarget(ex);
  const realized = realizedLabel(result);
  const realizedDone = !!result?.setResults?.some((s) => s.completed);

  return (
    <View
      testID={`exercise-${row.leafIndex}`}
      style={{
        paddingVertical: 13,
        paddingHorizontal: 14,
        paddingLeft,
        gap: 4,
        borderTopColor: colors.border,
        borderTopWidth: divider ? 1 : 0,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text
          style={{
            flex: 1,
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.body.fontSize,
          }}
        >
          {name}
        </Text>
        {target ? (
          <Text
            testID={`exercise-${row.leafIndex}-target`}
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {target}
          </Text>
        ) : null}
      </View>
      {/* Notes / consignes du bloc (TLX-170) : portent tout le contenu d'un échauffement ou
          retour au calme (params vides), et les consignes d'exécution d'un exercice. */}
      {ex.notes ? (
        <Text
          testID={`exercise-${row.leafIndex}-notes`}
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {ex.notes}
        </Text>
      ) : null}
      {realized ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
          <Feather
            name={realizedDone ? 'check-circle' : 'circle'}
            size={13}
            color={realizedDone ? colors.success : colors.textMuted}
          />
          <Text
            testID={`exercise-${row.leafIndex}-realized`}
            style={{
              color: realizedDone ? colors.success : colors.textMuted,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {realized}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Carte de synthèse de séance (ADR-38, TLX-160) : « phrase » condensée + KPIs (efforts,
 * volume en distance). Dérivée à la volée des `exercises.items` (rien de persisté) ; masquée
 * si la séance ne produit ni phrase ni KPI exploitable (dégradation propre).
 */
export function SessionSummaryCard({ exercises }: { exercises: ExerciseNode[] }) {
  const { colors, typography, spacing } = useTheme();
  const phrase = sessionPhrase(exercises);
  const { efforts, distanceMeters } = sessionKpis(exercises);
  const volume = formatDistanceVolume(distanceMeters);
  if (phrase === '' && efforts === 0) return null;

  const kpis: { key: string; label: string; value: string }[] = [];
  if (efforts > 0) kpis.push({ key: 'efforts', label: 'Efforts', value: String(efforts) });
  if (volume) kpis.push({ key: 'volume', label: 'Volume', value: volume });

  return (
    <Card testID="session-summary">
      <View style={{ gap: spacing[3] }}>
        {phrase !== '' ? (
          <Text
            testID="session-phrase"
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {phrase}
          </Text>
        ) : null}
        {kpis.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[4] }}>
            {kpis.map((k) => (
              <View key={k.key} style={{ gap: 2 }}>
                <Text
                  testID={`session-kpi-${k.key}`}
                  style={{
                    color: colors.textPrimary,
                    fontFamily: typography.fontFamily.bold,
                    fontSize: typography.h3.fontSize,
                  }}
                >
                  {k.value}
                </Text>
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: typography.fontFamily.regular,
                    fontSize: typography.bodySm.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                  }}
                >
                  {k.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

/**
 * Encart de **phase** (échauffement / retour au calme) — TLX-171. Présenté à part de la liste
 * d'exercices (il n'est ni compté, ni saisi en perf) ; affiche le nom et les notes (TLX-170), qui
 * portent tout le contenu de la phase. Exporté pour être réutilisé en mode saisie athlète.
 */
export function PhaseCard({
  exercise,
  icon,
  testID,
}: {
  exercise: Exercise;
  icon: keyof typeof Feather.glyphMap;
  testID: string;
}) {
  const { colors, typography, spacing, radius, borderWidth } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: spacing[3],
        padding: spacing[3],
        borderRadius: radius.md,
        borderWidth: borderWidth.hairline,
        borderColor: colors.borderStrong,
        backgroundColor: colors.surfaceSunken,
      }}
    >
      <Feather name={icon} size={18} color={colors.textSecondary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {exercise.name}
        </Text>
        {exercise.notes ? (
          <Text
            testID={`${testID}-notes`}
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.caption.fontSize,
            }}
          >
            {exercise.notes}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Contenu d'une séance en lecture seule : brief (métriques + consigne), phases (échauffement /
 * retour au calme) en encart, liste d'exercices (groupes intercalés, A1/A2, cibles, mesures relues
 * si `results`), garde-fous Réussi/Stop.
 */
export function SessionContent({
  exercises,
  brief,
  results,
  showSummary = true,
}: {
  exercises: ExerciseNode[];
  brief?: SessionBrief;
  results?: ExerciseResult[];
  /** Affiche l'en-tête de synthèse interne (métriques + phrase/KPIs). L'écran athlète le passe
   *  à `false` car il rend son propre hero + bandeau adaptatif au-dessus (TLX-219). */
  showSummary?: boolean;
}) {
  const { colors, typography, spacing } = useTheme();
  const { warmup, cooldown } = splitPhases(exercises);
  const rows = exerciseRenderRows(exercises);
  const leaves = rows.filter(
    (r): r is Extract<ExerciseRenderRow, { type: 'leaf' }> => r.type === 'leaf',
  );
  const completed = results
    ? leaves.filter((l) => resultForLeaf(results, l.exercise)?.setResults?.some((s) => s.completed))
        .length
    : 0;

  return (
    <View style={{ gap: spacing[5] }}>
      {showSummary ? <BriefMetrics brief={brief} items={exercises} /> : null}
      {showSummary ? <SessionSummaryCard exercises={exercises} /> : null}
      {brief?.athleteIntent ? <AthleteIntentBanner text={brief.athleteIntent} /> : null}

      {warmup ? (
        <PhaseCard exercise={warmup} icon="activity" testID="session-phase-warmup" />
      ) : null}

      <View style={{ gap: spacing[3] }}>
        <SectionTitle testID="exercise-count">
          Exercices · {results ? `${completed}/${leaves.length}` : leaves.length}
        </SectionTitle>
        {leaves.length === 0 ? (
          <Card>
            <Text
              style={{
                color: colors.textMuted,
                fontFamily: typography.fontFamily.regular,
                fontSize: typography.body.fontSize,
              }}
            >
              Aucun exercice dans cette séance.
            </Text>
          </Card>
        ) : (
          <Card padded={false}>
            {rows.map((row, ri) =>
              row.type === 'group' ? (
                <GroupHeader key={row.key} testID={row.key} group={row.group} divider={ri > 0} />
              ) : (
                <ReadOnlyLeafRow
                  key={row.key}
                  row={row}
                  result={results ? resultForLeaf(results, row.exercise) : undefined}
                  divider={ri > 0 && !row.firstInGroup}
                />
              ),
            )}
          </Card>
        )}
      </View>

      {cooldown ? (
        <PhaseCard exercise={cooldown} icon="wind" testID="session-phase-cooldown" />
      ) : null}

      <SuccessStopCard
        successCriteria={brief?.successCriteria}
        stopCriteria={brief?.stopCriteria}
      />
    </View>
  );
}
