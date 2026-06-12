import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, ValidateIf } from 'class-validator';

/** Motif d'indisponibilité quand l'affectation est skipped — schéma `SkipReason` (ADR-31). */
export enum SkipReason {
  Injury = 'injury',
  Absence = 'absence',
  Weather = 'weather',
  Other = 'other',
}

/** Statuts posables via `PATCH /assignments/{id}` — jamais `completed` (réservé à la perf). */
export enum AssignmentPatchStatus {
  Assigned = 'assigned',
  InProgress = 'in_progress',
  Skipped = 'skipped',
}

/**
 * Corps de `PATCH /assignments/{id}` — schéma `AssignmentUpdateRequest` (ADR-31).
 * Mise à jour partielle ; l'invariant « au moins un champ » est vérifié dans le
 * service (un corps vide n'est pas une erreur de validation de forme). `dueDate`
 * accepte `null` explicite (retire l'échéance), distinct d'« absent » (inchangé).
 */
export class AssignmentUpdateRequestDto {
  @ApiPropertyOptional({ enum: AssignmentPatchStatus })
  @IsOptional()
  @IsEnum(AssignmentPatchStatus)
  status?: AssignmentPatchStatus;

  @ApiPropertyOptional({ format: 'date', nullable: true, description: 'null retire l’échéance.' })
  @IsOptional()
  // null explicite autorisé (retire l'échéance) ; sinon doit être une date ISO.
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601()
  dueDate?: string | null;

  @ApiPropertyOptional({ enum: SkipReason })
  @IsOptional()
  @IsEnum(SkipReason)
  skipReason?: SkipReason;
}
