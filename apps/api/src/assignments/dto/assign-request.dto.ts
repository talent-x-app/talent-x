import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/** Cadence de récurrence (ADR-35) — `weekly` seule au MVP, enum extensible. */
export enum RecurrenceFrequency {
  Weekly = 'weekly',
}

/**
 * Règle de récurrence d'affectation (ADR-35, schéma `RecurrenceRule`). Matérialise
 * une occurrence datée par cadence (hebdomadaire) jusqu'à `until` inclus. La
 * cohérence avec `dueDate` (présence, `until ≥ dueDate`, borne 52) est vérifiée
 * côté service (422 dédiés), class-validator ne croisant pas deux champs nativement.
 */
export class RecurrenceRuleDto {
  @ApiProperty({ enum: RecurrenceFrequency, description: 'Cadence (weekly au MVP).' })
  @IsEnum(RecurrenceFrequency)
  frequency!: RecurrenceFrequency;

  @ApiProperty({ format: 'date', description: 'Dernière occurrence possible (incluse).' })
  @IsDateString()
  until!: string;
}

/**
 * Corps de `POST /sessions/{id}/assign` — schéma `AssignRequest` (ADR-30 + ADR-35).
 * Cible = athlètes (`athleteIds`) et/ou groupes (`groupIds`). L'invariant
 * « au moins l'un des deux non vide » est vérifié côté service (422), class-validator
 * ne l'exprimant pas de façon native. `recurrence` (ADR-35) répète l'affectation sur
 * des occurrences datées.
 */
export class AssignRequestDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid', minItems: 1 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  athleteIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid', minItems: 1 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  groupIds?: string[];

  @ApiPropertyOptional({ format: 'date', description: 'Échéance commune (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ type: RecurrenceRuleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrence?: RecurrenceRuleDto;
}
