import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsUUID } from 'class-validator';

/**
 * Corps de `POST /sessions/{id}/assign` — schéma `AssignRequest` (ADR-30).
 * Cible = athlètes (`athleteIds`) et/ou groupes (`groupIds`). L'invariant
 * « au moins l'un des deux non vide » est vérifié côté service (422), class-validator
 * ne l'exprimant pas de façon native.
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
}
