import { Injectable, NotFoundException } from '@nestjs/common';
import { type Performance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentGate } from '../common/authorization/consent.gate';
import { RecordsService } from '../progress/records.service';
import { SessionStatus } from '../sessions/dto/session-create.dto';
import type { ExerciseDto } from '../sessions/dto/exercises.dto';
import { serializeExercises } from '../sessions/exercises-schema';
import { AssignmentStatus } from './dto/assignment.dto';
import { PerformanceDto } from './dto/performance.dto';
import type { ResultsDocDto } from './dto/results.dto';
import { serializeResults } from './results-schema';
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
          ...serializeExercises(dto.exercises),
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
          ...serializeResults(dto.results),
          rpe: dto.rpe ?? null,
          notes: dto.notes ?? null,
          submittedAt: date,
        },
      });
    });

    return this.withRecordCandidates(toPerformanceDto(performance), dto);
  }

  /**
   * Supprime une séance libre (ADR-36 §5, amendement §B1–B3). Symétrique du `POST` : les trois
   * maillons créés atomiquement disparaissent ensemble, dans une transaction.
   *
   * **Garde** (§B1) : l'affectation appartient à l'appelant **et** sa séance est `self_logged`
   * dont il est l'auteur. Tout écart → **404**, indistinguable de « n'existe pas »
   * (anti-énumération) : un athlète ne supprime ni la séance d'un coach, ni celle d'un autre
   * athlète. Le filtre porte la garde entière — il n'y a pas de lecture puis vérification.
   *
   * **Portée du soft-delete** (§B2) : `deletedAt` sur la séance et l'affectation suffit, c'est la
   * maille que lit l'aval (`AthleteProgressService.derive` filtre les deux) → la séance sort de la
   * progression, de l'assiduité et de la détection de candidats sans qu'une dérivation change.
   * `Performance` ne porte pas de `deleted_at` et n'en gagne pas : elle n'est lue que par son
   * affectation (1:1), et la conserver garde la trace d'audit (ADR-33).
   */
  async deleteTrainingLogSession(athleteId: string, assignmentId: string): Promise<void> {
    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: {
        id: assignmentId,
        athleteId,
        deletedAt: null,
        session: {
          deletedAt: null,
          coachId: athleteId, // séance libre : l'athlète en est l'auteur (ADR-36 §1)
          status: SessionStatus.SelfLogged,
        },
      },
      select: { id: true, sessionId: true, performance: { select: { id: true } } },
    });
    if (!assignment) {
      throw new NotFoundException('Séance libre introuvable.');
    }

    const now = new Date();
    const performanceId = assignment.performance?.id;
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({ where: { id: assignment.sessionId }, data: { deletedAt: now } });
      await tx.sessionAssignment.update({ where: { id: assignment.id }, data: { deletedAt: now } });
      // §B3 : `personal_records` est **matérialisée**, pas dérivée — un soft-delete ne la traverse
      // pas, et l'ON DELETE SET NULL de `performance_id` ne se déclenche qu'à la suppression
      // physique. Sans ce geste, le record confirmé survivrait à la séance qui l'a produit,
      // indiscernable d'un record manuel (ADR-32). Aucun recalcul du record précédent : un record
      // est **revendiqué**, pas agrégé (ADR-20) — les marques antérieures ressortiront en candidats.
      if (performanceId) {
        await tx.personalRecord.deleteMany({ where: { athleteId, performanceId } });
      }
    });
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
