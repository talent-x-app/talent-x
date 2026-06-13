import { Injectable } from '@nestjs/common';
import { Prisma, type Performance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentGate } from '../common/authorization/consent.gate';
import { RecordsService } from '../progress/records.service';
import { SessionStatus } from '../sessions/dto/session-create.dto';
import type { ExerciseDto } from '../sessions/dto/exercises.dto';
import { AssignmentStatus } from './dto/assignment.dto';
import { PerformanceDto } from './dto/performance.dto';
import type { ResultsDocDto } from './dto/results.dto';
import type { TrainingLogRequestDto } from './dto/training-log.dto';

/**
 * Journal d'entraînement (ADR-36). Une séance **libre** consignée par l'athlète crée
 * atomiquement les trois maillons existants — séance `self_logged` (`coach_id` = athlète),
 * affectation `completed`, performance — afin d'alimenter progression/records/assiduité
 * **sans rework** de l'aval (athleteId-scopé). Porte de consentement `data_processing`
 * (même règle que la saisie de perf). Les candidats record (ADR-20) sont joints à la réponse.
 */
@Injectable()
export class TrainingLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: ConsentGate,
    private readonly records: RecordsService,
  ) {}

  async logTrainingSession(athleteId: string, dto: TrainingLogRequestDto): Promise<PerformanceDto> {
    await this.consent.assertActiveConsent(athleteId, 'data_processing');

    // La date d'entraînement pilote séance, échéance et date de la perf (progression/records).
    const date = new Date(dto.date);

    const performance = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          coachId: athleteId, // séance libre : l'athlète est son propre propriétaire (ADR-36)
          title: dto.title,
          status: SessionStatus.SelfLogged,
          scheduledDate: date,
          exercises: toExercisesJson(dto.exercises),
        },
      });
      const assignment = await tx.sessionAssignment.create({
        data: {
          sessionId: session.id,
          athleteId,
          status: AssignmentStatus.Completed,
          dueDate: date,
        },
      });
      return tx.performance.create({
        data: {
          assignmentId: assignment.id,
          athleteId,
          results: toResultsJson(dto.results),
          resultsSchemaVersion: dto.results.schemaVersion ?? 1,
          rpe: dto.rpe ?? null,
          notes: dto.notes ?? null,
          submittedAt: date,
        },
      });
    });

    return this.withRecordCandidates(toPerformanceDto(performance), dto);
  }

  /**
   * Joint les candidats record (ADR-20) à la réponse — additif et défensif (une détection
   * en échec ne fait jamais échouer la saisie). Les blocs typés viennent directement de la
   * requête (mêmes items que la séance créée).
   */
  private async withRecordCandidates(
    dto: PerformanceDto,
    request: TrainingLogRequestDto,
  ): Promise<PerformanceDto> {
    try {
      const exercises = (request.exercises.items ?? []) as Partial<ExerciseDto>[];
      const candidates = await this.records.detectCandidates(
        dto.athleteId,
        exercises,
        dto.results.items,
      );
      return candidates.length > 0 ? { ...dto, recordCandidates: candidates } : dto;
    } catch {
      return dto;
    }
  }
}

/** Sérialise un `ExercisesDoc` en JSON Prisma (schemaVersion par défaut 1). */
function toExercisesJson(doc: TrainingLogRequestDto['exercises']): Prisma.InputJsonValue {
  return {
    schemaVersion: doc.schemaVersion ?? 1,
    items: doc.items as unknown as Prisma.InputJsonValue[],
  };
}

/** Sérialise un `ResultsDoc` en JSON Prisma (schemaVersion par défaut 1). */
function toResultsJson(doc: ResultsDocDto): Prisma.InputJsonValue {
  return {
    schemaVersion: doc.schemaVersion ?? 1,
    items: doc.items as unknown as Prisma.InputJsonValue[],
  };
}

function toPerformanceDto(performance: Performance): PerformanceDto {
  const results = (performance.results as { schemaVersion?: number; items?: unknown[] }) ?? {};
  return {
    id: performance.id,
    assignmentId: performance.assignmentId,
    athleteId: performance.athleteId,
    results: {
      schemaVersion: results.schemaVersion ?? performance.resultsSchemaVersion,
      items: (results.items ?? []) as ResultsDocDto['items'],
    },
    rpe: performance.rpe ?? undefined,
    notes: performance.notes ?? undefined,
    submittedAt: performance.submittedAt.toISOString(),
    updatedAt: performance.updatedAt.toISOString(),
  };
}
