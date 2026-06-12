import { AssignmentStatus, type Assignment, type DashboardAthlete } from '@talent-x/api-client';
import { useTheme } from '@talent-x/design-tokens';
import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { Card } from '../components/ui';
import { athleteFullName } from '../coach/athlete-ui';
import { AssignmentStatusBadge, sessionTitle } from '../athlete/athlete-session-ui';
import { CoachAssignmentActions } from '../assignments/assignment-lifecycle';

/**
 * Sections détaillées du tableau de bord coach (C-01 §4) — TLX-082/083, enfants de TLX-081.
 * Au-delà des KPIs (compteurs), ces sections **listent** les éléments actionnables :
 *  - « À revoir » (TLX-082) : athlètes ayant une perf soumise sans retour du coach, dérivé du
 *    `toReviewCount` du dashboard (cohérent avec `summary.toReview`) + état positif si rien.
 *  - « Aujourd'hui » (TLX-083) : affectations à échéance ce jour, non réalisées, via
 *    `GET /assignments` (role-aware coach) filtré côté front avec **la même borne de jour UTC**
 *    que la dérivation backend (`CoachInsightsService`), pour rester cohérent avec `summary.today`.
 */

/** Statuts « à faire » (échéance) — aligné sur `PENDING_STATUSES` du backend. */
const PENDING_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.assigned,
  AssignmentStatus.in_progress,
];

/** Une affectation tombe « aujourd'hui » si sa `dueDate` est le jour courant en **UTC** (cf. backend). */
export function isDueToday(dueDate: string | undefined, now: Date): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

/** Affectations à échéance aujourd'hui et non réalisées (`assigned`/`in_progress`). */
export function selectTodayAssignments(list: Assignment[], now: Date): Assignment[] {
  return list.filter((a) => PENDING_STATUSES.includes(a.status) && isDueToday(a.dueDate, now));
}

/** Athlètes ayant des perfs à revoir, triés par nombre décroissant. */
export function athletesToReview(athletes: DashboardAthlete[]): DashboardAthlete[] {
  return athletes
    .filter((a) => a.toReviewCount > 0)
    .sort((x, y) => y.toReviewCount - x.toReviewCount);
}

/** Athlètes en retard (affectations échues non réalisées), tri décroissant. */
export function athletesWithOverdue(athletes: DashboardAthlete[]): DashboardAthlete[] {
  return athletes.filter((a) => a.overdueCount > 0).sort((x, y) => y.overdueCount - x.overdueCount);
}

/** Athlètes dont le consentement `coach_access` manque (champ explicitement `false`). */
export function athletesMissingConsent(athletes: DashboardAthlete[]): DashboardAthlete[] {
  return athletes.filter((a) => a.coachAccessGranted === false);
}

/** Intitulé de section (uppercase, tokenisé) — partagé par les deux sections. */
function SectionTitle({ children }: { children: string }) {
  const { colors, typography } = useTheme();
  return (
    <Text
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

/**
 * Section « À revoir » (TLX-082) : athlètes avec perfs en attente de retour, chacun cliquable
 * vers son détail (C-03). État positif « Rien à revoir » si la liste est vide.
 */
export function ToReviewSection({
  athletes,
  onPressAthlete,
}: {
  athletes: DashboardAthlete[];
  onPressAthlete: (athlete: DashboardAthlete) => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const toReview = athletesToReview(athletes);

  return (
    <View style={{ gap: spacing[3] }}>
      <SectionTitle>À revoir</SectionTitle>
      {toReview.length === 0 ? (
        <Card testID="coach-dashboard-toreview-empty" style={{ backgroundColor: colors.successBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
            <Feather name="check-circle" size={18} color={colors.success} />
            <Text
              style={{
                color: colors.success,
                fontFamily: typography.fontFamily.medium,
                fontSize: typography.bodySm.fontSize,
              }}
            >
              Rien à revoir — tout est à jour.
            </Text>
          </View>
        </Card>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {toReview.map((athlete) => (
            <Card
              key={athlete.id}
              testID={`coach-dashboard-toreview-${athlete.id}`}
              onPress={() => onPressAthlete(athlete)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      color: colors.textPrimary,
                      fontFamily: typography.fontFamily.medium,
                      fontSize: typography.body.fontSize,
                    }}
                  >
                    {athleteFullName(athlete)}
                  </Text>
                  <Text
                    style={{
                      color: colors.textMuted,
                      fontFamily: typography.fontFamily.regular,
                      fontSize: typography.bodySm.fontSize,
                    }}
                  >
                    {athlete.toReviewCount} perf{athlete.toReviewCount > 1 ? 's' : ''} à revoir
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.textMuted} />
              </View>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Section « Alertes » (TLX-084, Carte C-01 §5) : au-delà du compteur agrégé, liste les signaux
 * **par athlète** — séances manquées (`overdueCount`) et consentement d'accès manquant
 * (`coachAccessGranted === false`) — chacun cliquable vers le détail (C-03). Dérivée du
 * dashboard (ADR-17), donc cohérente avec `summary.alerts`. Rendue `null` sans signal.
 */
export function AlertsSection({
  athletes,
  onPressAthlete,
}: {
  athletes: DashboardAthlete[];
  onPressAthlete: (athlete: DashboardAthlete) => void;
}) {
  const { colors, typography, spacing } = useTheme();
  const overdue = athletesWithOverdue(athletes);
  const consentMissing = athletesMissingConsent(athletes);
  if (overdue.length === 0 && consentMissing.length === 0) return null;

  const missedSessions = overdue.reduce((sum, a) => sum + a.overdueCount, 0);
  const messages: string[] = [];
  if (missedSessions > 0) {
    messages.push(`${missedSessions} séance${missedSessions > 1 ? 's' : ''} en retard`);
  }
  if (consentMissing.length > 0) {
    messages.push(
      `${consentMissing.length} consentement${consentMissing.length > 1 ? 's' : ''} d'accès manquant${
        consentMissing.length > 1 ? 's' : ''
      }`,
    );
  }

  return (
    <View style={{ gap: spacing[3] }}>
      <SectionTitle>Alertes</SectionTitle>
      {/* Résumé agrégé (bandeau historique TLX-081), même testID pour la continuité. */}
      <Card
        testID="coach-dashboard-alerts"
        style={{ backgroundColor: colors.warningBg, borderColor: colors.warning }}
      >
        <Text
          style={{
            color: colors.textPrimary,
            fontFamily: typography.fontFamily.medium,
            fontSize: typography.bodySm.fontSize,
          }}
        >
          {messages.join(' · ')}
        </Text>
      </Card>
      {/* Signaux détaillés par athlète, actionnables. */}
      <View style={{ gap: spacing[2] }}>
        {overdue.map((athlete) => (
          <AlertRow
            key={`overdue-${athlete.id}`}
            testID={`coach-dashboard-alert-overdue-${athlete.id}`}
            icon="clock"
            name={athleteFullName(athlete)}
            detail={`${athlete.overdueCount} séance${athlete.overdueCount > 1 ? 's' : ''} manquée${
              athlete.overdueCount > 1 ? 's' : ''
            }`}
            onPress={() => onPressAthlete(athlete)}
          />
        ))}
        {consentMissing.map((athlete) => (
          <AlertRow
            key={`consent-${athlete.id}`}
            testID={`coach-dashboard-alert-consent-${athlete.id}`}
            icon="shield-off"
            name={athleteFullName(athlete)}
            detail="Consentement d'accès manquant"
            onPress={() => onPressAthlete(athlete)}
          />
        ))}
      </View>
    </View>
  );
}

/** Ligne d'alerte actionnable : icône signal + athlète + détail + chevron. */
function AlertRow({
  testID,
  icon,
  name,
  detail,
  onPress,
}: {
  testID: string;
  icon: keyof typeof Feather.glyphMap;
  name: string;
  detail: string;
  onPress: () => void;
}) {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card testID={testID} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <Feather name={icon} size={18} color={colors.warning} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: colors.textPrimary,
              fontFamily: typography.fontFamily.medium,
              fontSize: typography.body.fontSize,
            }}
          >
            {name}
          </Text>
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            {detail}
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.textMuted} />
      </View>
    </Card>
  );
}

/**
 * Carte « Tout est à jour » (TLX-085, Carte C-01 §6) : état positif global affiché à la place
 * des sections quand il n'y a **ni** alerte, **ni** perf à revoir, **ni** séance prévue ce jour.
 */
export function AllClearCard() {
  const { colors, typography, spacing } = useTheme();
  return (
    <Card testID="coach-dashboard-all-clear" style={{ backgroundColor: colors.successBg }}>
      <View style={{ alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] }}>
        <Feather name="check-circle" size={28} color={colors.success} />
        <Text
          style={{
            color: colors.success,
            fontFamily: typography.fontFamily.bold,
            fontSize: typography.body.fontSize,
          }}
        >
          Tout est à jour
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontFamily: typography.fontFamily.regular,
            fontSize: typography.bodySm.fontSize,
            textAlign: 'center',
          }}
        >
          Aucune alerte, rien à revoir et rien de prévu aujourd'hui.
        </Text>
      </View>
    </Card>
  );
}

/**
 * Section « Aujourd'hui » (TLX-083) : affectations du jour + statut. Le parent fournit la liste
 * déjà filtrée (échéance du jour, non réalisées) et un résolveur nom d'athlète. États
 * chargement / erreur (la liste vient d'une 2ᵉ requête) / vide.
 */
export function TodaySection({
  assignments,
  nameById,
  isLoading,
  isError,
  onRetry,
  onChanged,
}: {
  assignments: Assignment[];
  nameById: Map<string, string>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Rappelé après une replanification/désassignation (ADR-31) pour rafraîchir les vues. */
  onChanged?: () => void;
}) {
  const { colors, typography, spacing } = useTheme();

  return (
    <View style={{ gap: spacing[3] }}>
      <SectionTitle>Aujourd'hui</SectionTitle>
      {isLoading ? (
        <Card testID="coach-dashboard-today-loading">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Chargement des séances du jour…
          </Text>
        </Card>
      ) : isError ? (
        <Card testID="coach-dashboard-today-error" onPress={onRetry}>
          <Text
            style={{
              color: colors.textSecondary,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Impossible de charger les séances du jour. Touche pour réessayer.
          </Text>
        </Card>
      ) : assignments.length === 0 ? (
        <Card testID="coach-dashboard-today-empty">
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: typography.fontFamily.regular,
              fontSize: typography.bodySm.fontSize,
            }}
          >
            Rien de prévu aujourd'hui.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: spacing[2] }}>
          {assignments.map((assignment) => (
            <Card key={assignment.id} testID={`coach-dashboard-today-${assignment.id}`}>
              <View style={{ gap: spacing[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontFamily: typography.fontFamily.medium,
                        fontSize: typography.body.fontSize,
                      }}
                    >
                      {sessionTitle(assignment)}
                    </Text>
                    <Text
                      style={{
                        color: colors.textMuted,
                        fontFamily: typography.fontFamily.regular,
                        fontSize: typography.bodySm.fontSize,
                      }}
                    >
                      {nameById.get(assignment.athleteId) ?? 'Athlète'}
                    </Text>
                  </View>
                  <AssignmentStatusBadge status={assignment.status} />
                </View>
                {/* ADR-31 (TLX-108) : replanifier / désassigner depuis le quotidien du coach. */}
                <CoachAssignmentActions assignment={assignment} onChanged={onChanged} />
              </View>
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}
