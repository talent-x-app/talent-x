import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentGate } from '../common/authorization/consent.gate';
import { OwnershipService } from '../common/authorization/ownership.service';
import type { ExerciseDto } from '../sessions/dto/exercises.dto';
import type { ExerciseResultDto } from '../assignments/dto/results.dto';
import { PENDING_STATUSES, dayBounds, round } from './coach-insights.service';
import { bestMeasuresByEvent, isBetter, type EventBest } from './record-detection';
import { seasonAggregates } from './season-marks';
import { ProgressDto, ProgressSeriesDto } from './dto/progress.dto';

/**
 * Progression de l'athlète connecté (TLX-090, ADR-21). Dérivation à la lecture :
 *  - `metrics` — mêmes dérivations que `StatsMetrics` (ADR-17), sur **toutes** les
 *    affectations actives de l'athlète (tous coachs confondus) ;
 *  - `series` — une série par épreuve (clé ADR-20, dérivée des blocs typés de la
 *    séance) : un point par performance soumise, `value` = meilleure marque de la
 *    perf (`bestMeasuresByEvent`), `date` = date de soumission, points triés par date.
 * Porte de consentement `data_processing` (donnée de santé dérivée).
 */
@Injectable()
export class AthleteProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentGate,
    private readonly ownership: OwnershipService,
  ) {}

  /** Progression de l'athlète connecté (porte `data_processing`). */
  async getMyProgress(athleteId: string): Promise<ProgressDto> {
    await this.consent.assertActiveConsent(athleteId, 'data_processing');
    return this.derive(athleteId);
  }

  /**
   * Progression d'un athlète lié, côté coach (TLX-112). Portes coach (lien actif + `coach_access`),
   * **cloisonnée au coach appelant** (ADR-51 §D3) : ne dérive que sur les affectations issues des
   * **séances de ce coach** (`session.coachId`). Un coach ne voit donc pas la progression bâtie sous
   * un autre coach — contrairement à la vue athlète (`getMyProgress`), unifiée car c'est sa donnée.
   */
  async getForCoach(coachId: string, athleteId: string): Promise<ProgressDto> {
    await this.ownership.assertCoachLinkedToAthlete(coachId, athleteId);
    await this.consent.assertActiveConsent(athleteId, 'coach_access');
    return this.derive(athleteId, coachId);
  }

  /**
   * Dérivation pure à la lecture (ADR-21). Sans `coachId` : vue athlète, **toutes** ses affectations
   * (tous coachs). Avec `coachId` : vue coach **cloisonnée** à ses propres séances (ADR-51 §D3).
   */
  private async derive(athleteId: string, coachId?: string): Promise<ProgressDto> {
    const assignments = await this.prisma.sessionAssignment.findMany({
      where: {
        athleteId,
        deletedAt: null,
        session: { deletedAt: null, ...(coachId ? { coachId } : {}) },
      },
      select: {
        status: true,
        dueDate: true,
        session: { select: { exercises: true, scheduledDate: true } },
        performance: { select: { results: true, rpe: true, submittedAt: true } },
      },
    });

    const { todayStart } = dayBounds();
    const total = assignments.length;
    let completed = 0;
    let missed = 0;
    let skipped = 0;
    const rpes: number[] = [];
    let lastPerformanceAt: Date | undefined;

    // Accumulation des séries : épreuve → **meilleure marque par jour** (ADR-56). On agrège par
    // jour (clé `YYYY-MM-DD`) en gardant la meilleure mesure : deux perfs d'une même épreuve le
    // même jour (ex. 2 séances de 150 m, ou journal + séance coach) ne donnent qu'**un** point.
    const seriesByKey = new Map<
      string,
      { event: Omit<EventBest, 'value'>; byDay: Map<string, number> }
    >();

    for (const a of assignments) {
      if (a.status === 'completed') completed += 1;
      if (a.status === 'skipped') skipped += 1;
      const pending = (PENDING_STATUSES as readonly string[]).includes(a.status);
      if (a.dueDate && pending && a.dueDate < todayStart) missed += 1;
      if (!a.performance) continue;

      if (a.performance.rpe != null) rpes.push(a.performance.rpe);
      if (!lastPerformanceAt || a.performance.submittedAt > lastPerformanceAt) {
        lastPerformanceAt = a.performance.submittedAt;
      }

      // Date **réalisée** de la marque (ADR-56) : échéance de l'affectation, sinon date planifiée
      // de la séance, sinon (repli) la soumission. Évite que les perfs assignées se regroupent au
      // jour de saisie ; le journal libre (dueDate = date d'entraînement) reste exact.
      const achievedAt = a.dueDate ?? a.session.scheduledDate ?? a.performance.submittedAt;
      const dayKey = achievedAt.toISOString().slice(0, 10);

      const exercises = docItems(a.session.exercises) as Partial<ExerciseDto>[];
      const results = docItems(a.performance.results) as Partial<ExerciseResultDto>[];
      for (const best of bestMeasuresByEvent(exercises, results)) {
        const entry = seriesByKey.get(best.eventKey) ?? {
          event: {
            eventKey: best.eventKey,
            label: best.label,
            unit: best.unit,
            direction: best.direction,
          },
          byDay: new Map<string, number>(),
        };
        const current = entry.byDay.get(dayKey);
        if (current === undefined || isBetter(best.value, current, best.direction)) {
          entry.byDay.set(dayKey, best.value);
        }
        seriesByKey.set(best.eventKey, entry);
      }
    }

    // Saison (année civile) & marques par année dérivées des points (ADR-34), `now` injecté.
    const now = new Date();
    const series: ProgressSeriesDto[] = [...seriesByKey.values()]
      .map(({ event, byDay }) => {
        const ordered = [...byDay.entries()]
          .map(([day, value]) => ({ date: new Date(`${day}T00:00:00.000Z`), value }))
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        const { seasonBest, marksByYear } = seasonAggregates(ordered, event.direction, now);
        return {
          ...event,
          points: ordered.map((p) => ({ date: p.date.toISOString().slice(0, 10), value: p.value })),
          seasonBest,
          marksByYear,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

    return {
      athleteId,
      metrics: {
        assignmentsTotal: total,
        completed,
        missed,
        skipped,
        // Assiduité (ADR-31) : skipped exclu du dénominateur.
        completionRate: total - skipped > 0 ? round(completed / (total - skipped), 2) : 0,
        avgRpe: rpes.length ? round(rpes.reduce((s, r) => s + r, 0) / rpes.length, 1) : undefined,
        lastPerformanceAt: lastPerformanceAt?.toISOString(),
      },
      series,
    };
  }
}

/** Items d'un document JSONB `{ items: [...] }` — lecture défensive. */
function docItems(doc: unknown): unknown[] {
  const items = (doc as { items?: unknown[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}
