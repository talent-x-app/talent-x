import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Statut dérivé d'un athlète sur le tableau de bord coach (Carte C-01 §8). */
export enum AthleteStatus {
  /** À jour : pas de retard ni de perf en attente de revue. */
  UpToDate = 'up_to_date',
  /** En retard : au moins une affectation échue non réalisée. */
  Late = 'late',
  /** À revoir : au moins une performance soumise sans retour du coach. */
  PendingReview = 'pending_review',
}

/** Zone d'interprétation de la charge (ACWR) — schéma `LoadZone` (TLX-113). */
export enum LoadZone {
  /** Historique insuffisant pour un ratio fiable. */
  Insufficient = 'insufficient',
  /** ACWR < 0.8 : sous-charge (désentraînement). */
  Underload = 'underload',
  /** ACWR 0.8–1.3 : zone sûre. */
  Optimal = 'optimal',
  /** ACWR > 1.3 : surcharge (risque accru de blessure). */
  Overload = 'overload',
}

/** Charge d'entraînement d'un athlète (méthode sRPE/ACWR de Foster, TLX-113). */
export class TrainingLoadDto {
  @ApiProperty({ description: 'Charge aiguë (somme sRPE 7 j).' })
  acute!: number;

  @ApiProperty({ description: 'Charge chronique (moyenne hebdomadaire sur 28 j).' })
  chronic!: number;

  @ApiPropertyOptional({ description: 'Ratio aigu:chronique (ACWR) ; absent si chronique nulle.' })
  acwr?: number;

  @ApiProperty({ enum: LoadZone, description: 'Interprétation de l’ACWR (zone sûre 0.8–1.3).' })
  zone!: LoadZone;

  @ApiProperty({ description: 'Charge de la semaine en cours.' })
  weeklyLoad!: number;

  @ApiPropertyOptional({ description: 'Monotonie (moyenne/écart-type des charges quotidiennes).' })
  monotony?: number;

  @ApiPropertyOptional({ description: 'Contrainte = charge hebdo × monotonie.' })
  strain?: number;

  @ApiProperty({ description: 'Nombre de séances chargées prises en compte (28 j).' })
  sessions!: number;
}

/** Athlète du coach enrichi de son statut dérivé — étend `UserSummary`. */
export class DashboardAthleteDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  sport?: string;

  @ApiProperty({ enum: AthleteStatus })
  status!: AthleteStatus;

  @ApiProperty({ description: 'Affectations échues non réalisées.' })
  overdueCount!: number;

  @ApiProperty({ description: 'Performances soumises en attente de retour du coach.' })
  toReviewCount!: number;

  @ApiPropertyOptional({
    description: "Accès aux perfs bloqué tant que l'athlète n'a pas accordé coach_access.",
  })
  coachAccessGranted?: boolean;

  @ApiPropertyOptional({
    type: TrainingLoadDto,
    description: 'Charge d’entraînement (TLX-113) ; présent seulement si coach_access accordé.',
  })
  load?: TrainingLoadDto;
}

/** Alertes & signaux agrégés (Carte C-01 §5). */
export class DashboardAlertsDto {
  @ApiProperty({ description: 'Affectations échues non réalisées, tous athlètes confondus.' })
  missedSessions!: number;

  @ApiProperty({ description: 'Athlètes liés sans consentement coach_access actif.' })
  consentMissing!: number;
}

/** KPIs et compteurs du tableau de bord. */
export class DashboardSummaryDto {
  @ApiProperty()
  athleteCount!: number;

  @ApiProperty({ description: 'Performances en attente de revue (toutes confondues).' })
  toReview!: number;

  @ApiProperty({ description: "Affectations à échéance aujourd'hui, non réalisées." })
  today!: number;

  @ApiProperty({ type: DashboardAlertsDto })
  alerts!: DashboardAlertsDto;
}

/** Tableau de bord coach — schéma `Dashboard` (dérivations TLX-080). */
export class DashboardDto {
  @ApiProperty({ type: [DashboardAthleteDto] })
  athletes!: DashboardAthleteDto[];

  @ApiProperty({ type: DashboardSummaryDto })
  summary!: DashboardSummaryDto;
}
