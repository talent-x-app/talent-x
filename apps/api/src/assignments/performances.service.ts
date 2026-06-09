import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Performance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/authorization/ownership.service';
import { ConsentGate } from '../common/authorization/consent.gate';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { RecordsService } from '../progress/records.service';
import type { ExerciseDto } from '../sessions/dto/exercises.dto';
import { PerformanceCreateDto, PerformanceDto } from './dto/performance.dto';
import type { ResultsDocDto } from './dto/results.dto';

/**
 * Performances (TLX-070). Relation 1:1 avec l'affectation (`assignment_id` unique).
 * Autorisation (matrice TX-SPEC-002 §6, RB-05/RB-08) :
 *  - saisie/MAJ (`submit`/`update`) → athlète **titulaire** de l'affectation, avec
 *    consentement `data_processing` actif (sinon 403 CONSENT_REQUIRED) ;
 *  - lecture (`get`) → athlète titulaire, **ou** coach propriétaire de la séance avec
 *    lien actif **et** consentement `coach_access` de l'athlète.
 * Idempotence (Idempotency-Key) assurée par l'unicité de `assignment_id` : rejouer la
 * soumission renvoie la performance initiale (spec §9.5). La 1ʳᵉ soumission passe
 * l'affectation au statut `completed` (« réalisée », TX-DATA-006 / spec §6).
 */
@Injectable()
export class PerformancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly consent: ConsentGate,
    private readonly records: RecordsService,
  ) {}

  /** Athlète titulaire saisit sa performance. Idempotent : renvoie l'existante si déjà soumise. */
  async submitPerformance(
    user: AuthenticatedUser,
    assignmentId: string,
    dto: PerformanceCreateDto,
  ): Promise<PerformanceDto> {
    const assignment = await this.loadAssignment(assignmentId);
    if (assignment.athleteId !== user.id) {
      throw new ForbiddenException('Cette affectation ne vous appartient pas.');
    }
    await this.consent.assertActiveConsent(user.id, 'data_processing');

    const performance = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.performance.findUnique({ where: { assignmentId } });
      if (existing) {
        return existing;
      }
      const created = await tx.performance.create({
        data: {
          assignmentId,
          athleteId: user.id,
          results: toResultsJson(dto.results),
          resultsSchemaVersion: dto.results.schemaVersion ?? 1,
          rpe: dto.rpe ?? null,
          notes: dto.notes,
        },
      });
      await tx.sessionAssignment.update({
        where: { id: assignmentId },
        data: { status: 'completed' },
      });
      return created;
    });
    return this.withRecordCandidates(toPerformanceDto(performance), assignmentId);
  }

  /**
   * Joint les candidats record (ADR-20) à la réponse de soumission/MAJ — additif et
   * défensif : une détection en échec ne doit jamais faire échouer la saisie.
   */
  private async withRecordCandidates(
    dto: PerformanceDto,
    assignmentId: string,
  ): Promise<PerformanceDto> {
    try {
      const session = await this.prisma.sessionAssignment
        .findUnique({ where: { id: assignmentId } })
        .session({ select: { exercises: true } });
      const exercises =
        ((session?.exercises as { items?: unknown[] } | null)?.items as
          | Partial<ExerciseDto>[]
          | undefined) ?? [];
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

  /** Lecture : athlète titulaire, ou coach propriétaire (lien actif + coach_access). */
  async getPerformance(user: AuthenticatedUser, assignmentId: string): Promise<PerformanceDto> {
    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
      include: { session: { select: { coachId: true } }, performance: true },
    });
    if (!assignment?.performance) {
      throw new NotFoundException('Performance introuvable.');
    }
    if (user.role === 'coach') {
      if (assignment.session.coachId !== user.id) {
        throw new ForbiddenException('Cette performance ne vous est pas accessible.');
      }
      await this.ownership.assertCoachLinkedToAthlete(user.id, assignment.athleteId);
      await this.consent.assertActiveConsent(assignment.athleteId, 'coach_access');
    } else if (assignment.athleteId !== user.id) {
      throw new ForbiddenException('Cette performance ne vous appartient pas.');
    }
    const dto = toPerformanceDto(assignment.performance);
    // Athlète titulaire : la proposition de record (ADR-20) survit au refetch / rechargement.
    if (user.role !== 'coach') {
      return this.withRecordCandidates(dto, assignmentId);
    }
    return dto;
  }

  /** Mise à jour par l'athlète titulaire (consentement requis). 404 si pas encore soumise. */
  async updatePerformance(
    user: AuthenticatedUser,
    assignmentId: string,
    dto: PerformanceCreateDto,
  ): Promise<PerformanceDto> {
    const assignment = await this.loadAssignment(assignmentId);
    if (assignment.athleteId !== user.id) {
      throw new ForbiddenException('Cette affectation ne vous appartient pas.');
    }
    await this.consent.assertActiveConsent(user.id, 'data_processing');

    const existing = await this.prisma.performance.findUnique({ where: { assignmentId } });
    if (!existing) {
      throw new NotFoundException('Performance introuvable.');
    }
    const updated = await this.prisma.performance.update({
      where: { assignmentId },
      data: {
        results: toResultsJson(dto.results),
        resultsSchemaVersion: dto.results.schemaVersion ?? 1,
        rpe: dto.rpe ?? null,
        notes: dto.notes ?? null,
      },
    });
    return this.withRecordCandidates(toPerformanceDto(updated), assignmentId);
  }

  /** Charge une affectation active (404 sinon). */
  private async loadAssignment(assignmentId: string) {
    const assignment = await this.prisma.sessionAssignment.findFirst({
      where: { id: assignmentId, deletedAt: null },
    });
    if (!assignment) {
      throw new NotFoundException('Affectation introuvable.');
    }
    return assignment;
  }
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
