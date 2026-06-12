import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import { ConsentGate } from '../common/authorization/consent.gate';
import {
  AthleteStatus,
  DashboardAthleteDto,
  DashboardDto,
  type TrainingLoadDto,
} from './dto/dashboard.dto';
import { StatsDto } from './dto/stats.dto';
import {
  computeTrainingLoad,
  plannedDurationMinutes,
  sessionLoad,
  type LoadPoint,
} from './training-load';

/** Statuts d'affectation comptant comme « à faire » (échéance / aujourd'hui). */
export const PENDING_STATUSES = ['assigned', 'in_progress'] as const;

/**
 * Dérivations de pilotage coach (TLX-080) — Carte C-01 §8. Le coach n'accède qu'à
 * **ses** athlètes liés et à **ses** séances (TX-ARCH-001 §9). Le tableau de bord
 * agrège retards, performances à revoir, échéances du jour et alertes ; les stats
 * d'un athlète sont **consent-gated** (`coach_access`) et exigent un lien actif.
 *
 * « À revoir » = performance soumise sans commentaire du coach (la revue = TLX-086).
 * « Réalisée » = affectation au statut `completed` (posé à la soumission, TLX-070).
 */
@Injectable()
export class CoachInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly consent: ConsentGate,
  ) {}

  /** Tableau de bord : athlètes liés enrichis de leur statut + KPIs agrégés. */
  async getCoachDashboard(coachId: string): Promise<DashboardDto> {
    const [links, assignments] = await Promise.all([
      this.prisma.coachAthleteLink.findMany({
        where: { coachId, endedAt: null },
        select: {
          athleteId: true,
          athlete: { select: { id: true, firstName: true, lastName: true, sport: true } },
        },
        distinct: ['athleteId'],
      }),
      this.prisma.sessionAssignment.findMany({
        where: { deletedAt: null, session: { coachId, deletedAt: null } },
        select: {
          athleteId: true,
          status: true,
          dueDate: true,
          // Séance planifiée : source de durée pour la charge sRPE (TLX-113).
          session: { select: { brief: true, exercises: true } },
          performance: {
            select: {
              id: true,
              rpe: true,
              submittedAt: true,
              comments: {
                where: { authorId: coachId, deletedAt: null },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    const athleteIds = links.map((l) => l.athleteId);
    const consentByAthlete = await this.coachAccessByAthlete(athleteIds);

    const { todayStart, tomorrowStart } = dayBounds();
    const now = new Date();
    const perAthlete = new Map<string, { overdue: number; toReview: number }>();
    const bump = (id: string, key: 'overdue' | 'toReview') => {
      const cur = perAthlete.get(id) ?? { overdue: 0, toReview: 0 };
      cur[key] += 1;
      perAthlete.set(id, cur);
    };
    // Charges de séance (sRPE) datées, par athlète, pour la dérivation de charge (TLX-113).
    const loadPointsByAthlete = new Map<string, LoadPoint[]>();

    let today = 0;
    for (const a of assignments) {
      const pending = (PENDING_STATUSES as readonly string[]).includes(a.status);
      if (a.dueDate && pending && a.dueDate < todayStart) {
        bump(a.athleteId, 'overdue');
      } else if (a.dueDate && pending && a.dueDate >= todayStart && a.dueDate < tomorrowStart) {
        today += 1;
      }
      if (a.performance && a.performance.comments.length === 0) {
        bump(a.athleteId, 'toReview');
      }
      if (a.performance) {
        const duration = plannedDurationMinutes(
          a.session?.brief as { durationMinutes?: number | null } | null,
          a.session?.exercises as { items?: { durationSeconds?: number | null }[] } | null,
        );
        const load = sessionLoad(a.performance.rpe, duration);
        if (load != null) {
          const points = loadPointsByAthlete.get(a.athleteId) ?? [];
          points.push({ date: a.performance.submittedAt, load });
          loadPointsByAthlete.set(a.athleteId, points);
        }
      }
    }

    const athletes: DashboardAthleteDto[] = links.map((l) => {
      const counts = perAthlete.get(l.athleteId) ?? { overdue: 0, toReview: 0 };
      const coachAccessGranted = consentByAthlete.get(l.athleteId) ?? false;
      // Charge consent-gated (RPE = donnée de l'athlète) : calculée seulement si coach_access.
      const load: TrainingLoadDto | undefined = coachAccessGranted
        ? toTrainingLoadDto(computeTrainingLoad(loadPointsByAthlete.get(l.athleteId) ?? [], now))
        : undefined;
      return {
        id: l.athlete.id,
        firstName: l.athlete.firstName ?? undefined,
        lastName: l.athlete.lastName ?? undefined,
        sport: l.athlete.sport ?? undefined,
        status: deriveStatus(counts.overdue, counts.toReview),
        overdueCount: counts.overdue,
        toReviewCount: counts.toReview,
        coachAccessGranted,
        ...(load ? { load } : {}),
      };
    });

    const missedSessions = athletes.reduce((sum, a) => sum + a.overdueCount, 0);
    const toReview = athletes.reduce((sum, a) => sum + a.toReviewCount, 0);
    const consentMissing = athletes.filter((a) => !a.coachAccessGranted).length;

    return {
      athletes,
      summary: {
        athleteCount: athletes.length,
        toReview,
        today,
        alerts: { missedSessions, consentMissing },
      },
    };
  }

  /** Stats d'un athlète lié — consent-gated (coach_access) + lien actif requis. */
  async getAthleteStats(coachId: string, athleteId: string): Promise<StatsDto> {
    await this.ownership.assertCoachLinkedToAthlete(coachId, athleteId);
    await this.consent.assertActiveConsent(athleteId, 'coach_access');

    const assignments = await this.prisma.sessionAssignment.findMany({
      where: { athleteId, deletedAt: null, session: { coachId, deletedAt: null } },
      select: {
        status: true,
        dueDate: true,
        performance: { select: { rpe: true, submittedAt: true } },
      },
    });

    const { todayStart } = dayBounds();
    const total = assignments.length;
    let completed = 0;
    let missed = 0;
    let skipped = 0;
    const rpes: number[] = [];
    let lastPerformanceAt: Date | undefined;

    for (const a of assignments) {
      if (a.status === 'completed') completed += 1;
      if (a.status === 'skipped') skipped += 1;
      const pending = (PENDING_STATUSES as readonly string[]).includes(a.status);
      if (a.dueDate && pending && a.dueDate < todayStart) missed += 1;
      if (a.performance) {
        if (a.performance.rpe != null) rpes.push(a.performance.rpe);
        if (!lastPerformanceAt || a.performance.submittedAt > lastPerformanceAt) {
          lastPerformanceAt = a.performance.submittedAt;
        }
      }
    }

    // Assiduité (ADR-31) : une séance skipped (indispo) ne pénalise pas l'athlète →
    // exclue du dénominateur. completionRate = completed / (total − skipped).
    const denominator = total - skipped;

    return {
      athleteId,
      metrics: {
        assignmentsTotal: total,
        completed,
        missed,
        skipped,
        completionRate: denominator > 0 ? round(completed / denominator, 2) : 0,
        avgRpe: rpes.length ? round(rpes.reduce((s, r) => s + r, 0) / rpes.length, 1) : undefined,
        lastPerformanceAt: lastPerformanceAt?.toISOString(),
      },
    };
  }

  /** État du consentement coach_access (dernière ligne) par athlète. */
  private async coachAccessByAthlete(athleteIds: string[]): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    if (athleteIds.length === 0) return map;
    const rows = await this.prisma.consent.findMany({
      where: { userId: { in: athleteIds }, type: 'coach_access' },
      orderBy: { createdAt: 'desc' },
      select: { userId: true, granted: true },
    });
    // findMany trié desc : la 1ʳᵉ ligne vue par athlète est la plus récente.
    for (const r of rows) {
      if (!map.has(r.userId)) map.set(r.userId, r.granted);
    }
    return map;
  }
}

/** Mappe la synthèse de charge pure vers le DTO (champs `null` → absents). */
function toTrainingLoadDto(load: ReturnType<typeof computeTrainingLoad>): TrainingLoadDto {
  return {
    acute: load.acute,
    chronic: load.chronic,
    ...(load.acwr != null ? { acwr: load.acwr } : {}),
    zone: load.zone as TrainingLoadDto['zone'],
    weeklyLoad: load.weeklyLoad,
    ...(load.monotony != null ? { monotony: load.monotony } : {}),
    ...(load.strain != null ? { strain: load.strain } : {}),
    sessions: load.sessions,
  };
}

/** Priorité du statut : retard > à revoir > à jour. */
function deriveStatus(overdue: number, toReview: number): AthleteStatus {
  if (overdue > 0) return AthleteStatus.Late;
  if (toReview > 0) return AthleteStatus.PendingReview;
  return AthleteStatus.UpToDate;
}

/** Bornes [aujourd'hui 00:00, demain 00:00) en UTC (dueDate est une date sans heure). */
export function dayBounds(): { todayStart: Date; tomorrowStart: Date } {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
  return { todayStart, tomorrowStart };
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
