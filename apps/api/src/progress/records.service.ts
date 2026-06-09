import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PersonalRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import { ConsentGate } from '../common/authorization/consent.gate';
import type { ExerciseDto } from '../sessions/dto/exercises.dto';
import type { ExerciseResultDto } from '../assignments/dto/results.dto';
import { bestMeasuresByEvent, isBetter } from './record-detection';
import { PersonalRecordDto, PersonalRecordListDto, RecordCandidateDto } from './dto/record.dto';

/**
 * Records personnels (TLX-076, ADR-20). Table matérialisée `personal_records`
 * (unicité athlète × épreuve) : la **détection** des candidats a lieu à la soumission
 * d'une performance (`detectCandidates`, additif sur la réponse), la **mise à jour**
 * reste à la main de l'athlète (`confirm`, valeur revalidée depuis la perf — jamais de
 * valeur libre). Portes : écriture athlète `data_processing`, lecture coach
 * `coach_access` + lien actif (mêmes règles que les performances).
 */
@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly consent: ConsentGate,
  ) {}

  /** Records de l'athlète connecté. */
  async listMine(athleteId: string): Promise<PersonalRecordListDto> {
    const records = await this.prisma.personalRecord.findMany({
      where: { athleteId },
      orderBy: { label: 'asc' },
    });
    return { items: records.map(toRecordDto) };
  }

  /** Records d'un athlète lié, côté coach (lien actif + consentement `coach_access`). */
  async listForCoach(coachId: string, athleteId: string): Promise<PersonalRecordListDto> {
    await this.ownership.assertCoachLinkedToAthlete(coachId, athleteId);
    await this.consent.assertActiveConsent(athleteId, 'coach_access');
    const records = await this.prisma.personalRecord.findMany({
      where: { athleteId },
      orderBy: { label: 'asc' },
    });
    return { items: records.map(toRecordDto) };
  }

  /**
   * Candidats record d'une performance : meilleure mesure par épreuve **strictement
   * meilleure** que le record courant (ou épreuve vierge). Lecture défensive — une
   * perf sans bloc typé mesurable renvoie simplement une liste vide.
   */
  async detectCandidates(
    athleteId: string,
    exercises: Partial<ExerciseDto>[],
    results: Partial<ExerciseResultDto>[],
  ): Promise<RecordCandidateDto[]> {
    const bests = bestMeasuresByEvent(exercises, results);
    if (bests.length === 0) return [];
    const records = await this.prisma.personalRecord.findMany({
      where: { athleteId, eventKey: { in: bests.map((b) => b.eventKey) } },
    });
    const byKey = new Map(records.map((r) => [r.eventKey, r]));
    return bests
      .filter((best) => {
        const current = byKey.get(best.eventKey);
        return !current || isBetter(best.value, Number(current.value), best.direction);
      })
      .map((best) => {
        const current = byKey.get(best.eventKey);
        return {
          eventKey: best.eventKey,
          label: best.label,
          value: best.value,
          unit: best.unit,
          previousValue: current ? Number(current.value) : undefined,
        };
      });
  }

  /**
   * Confirmation d'un candidat (proposition de mise à jour, ADR-20) : l'athlète
   * titulaire valide l'épreuve `eventKey` depuis la performance `performanceId`.
   * La mesure est recalculée côté serveur ; 422 si l'épreuve n'apparaît pas dans la
   * perf ou si la marque n'améliore pas le record courant.
   */
  async confirm(
    athleteId: string,
    eventKey: string,
    performanceId: string,
  ): Promise<PersonalRecordDto> {
    const performance = await this.prisma.performance.findUnique({
      where: { id: performanceId },
      include: { assignment: { include: { session: { select: { exercises: true } } } } },
    });
    if (!performance) {
      throw new NotFoundException('Performance introuvable.');
    }
    if (performance.athleteId !== athleteId) {
      throw new ForbiddenException('Cette performance ne vous appartient pas.');
    }
    await this.consent.assertActiveConsent(athleteId, 'data_processing');

    const exercises = docItems(performance.assignment.session.exercises);
    const results = docItems(performance.results);
    const best = bestMeasuresByEvent(
      exercises as Partial<ExerciseDto>[],
      results as Partial<ExerciseResultDto>[],
    ).find((b) => b.eventKey === eventKey);
    if (!best) {
      throw new UnprocessableEntityException('Aucune mesure de cette épreuve dans la performance.');
    }

    const current = await this.prisma.personalRecord.findUnique({
      where: { athleteId_eventKey: { athleteId, eventKey } },
    });
    if (current && !isBetter(best.value, Number(current.value), best.direction)) {
      throw new UnprocessableEntityException("La marque n'améliore pas le record actuel.");
    }

    const achievedAt = new Date(performance.submittedAt);
    const record = await this.prisma.personalRecord.upsert({
      where: { athleteId_eventKey: { athleteId, eventKey } },
      create: {
        athleteId,
        eventKey,
        label: best.label,
        value: best.value,
        unit: best.unit,
        direction: best.direction,
        achievedAt,
        performanceId,
      },
      update: { label: best.label, value: best.value, achievedAt, performanceId },
    });
    return toRecordDto(record);
  }
}

/** Items d'un document JSONB `{ items: [...] }` — lecture défensive. */
function docItems(doc: unknown): unknown[] {
  const items = (doc as { items?: unknown[] } | null)?.items;
  return Array.isArray(items) ? items : [];
}

function toRecordDto(record: PersonalRecord): PersonalRecordDto {
  return {
    id: record.id,
    athleteId: record.athleteId,
    eventKey: record.eventKey,
    label: record.label,
    value: Number(record.value),
    unit: record.unit as 's' | 'm',
    direction: record.direction as 'min' | 'max',
    achievedAt: record.achievedAt.toISOString().slice(0, 10),
    performanceId: record.performanceId ?? undefined,
    updatedAt: record.updatedAt.toISOString(),
  };
}
