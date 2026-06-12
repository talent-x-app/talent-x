import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentGate } from '../common/authorization/consent.gate';
import type { ExerciseDto } from '../sessions/dto/exercises.dto';
import type { ExerciseResultDto } from '../assignments/dto/results.dto';
import { PENDING_STATUSES, dayBounds, round } from './coach-insights.service';
import { bestMeasuresByEvent, type EventBest } from './record-detection';
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
  ) {}

  async getMyProgress(athleteId: string): Promise<ProgressDto> {
    await this.consent.assertActiveConsent(athleteId, 'data_processing');

    const assignments = await this.prisma.sessionAssignment.findMany({
      where: { athleteId, deletedAt: null, session: { deletedAt: null } },
      select: {
        status: true,
        dueDate: true,
        session: { select: { exercises: true } },
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

    // Accumulation des séries : épreuve → points datés (une entrée par perf).
    const seriesByKey = new Map<
      string,
      { event: Omit<EventBest, 'value'>; points: { date: Date; value: number }[] }
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
          points: [],
        };
        entry.points.push({ date: a.performance.submittedAt, value: best.value });
        seriesByKey.set(best.eventKey, entry);
      }
    }

    const series: ProgressSeriesDto[] = [...seriesByKey.values()]
      .map(({ event, points }) => ({
        ...event,
        points: points
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((p) => ({ date: p.date.toISOString().slice(0, 10), value: p.value })),
      }))
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
