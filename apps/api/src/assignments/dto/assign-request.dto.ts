import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsUUID } from 'class-validator';

/** Corps de `POST /sessions/{id}/assign` — schéma `AssignRequest`. */
export class AssignRequestDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  athleteIds!: string[];

  @ApiPropertyOptional({ format: 'date', description: 'Échéance commune (YYYY-MM-DD).' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
