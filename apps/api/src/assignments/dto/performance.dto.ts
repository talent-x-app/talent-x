import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { RecordCandidateDto } from '../../progress/dto/record.dto';
import { ResultsDocDto } from './results.dto';

/** Corps de `POST/PUT /assignments/{id}/performance` — schéma `PerformanceCreate`. */
export class PerformanceCreateDto {
  @ApiProperty({ type: ResultsDocDto })
  @ValidateNested()
  @Type(() => ResultsDocDto)
  results!: ResultsDocDto;

  @ApiPropertyOptional({ minimum: 1, maximum: 10, description: 'Effort perçu (RPE) 1..10.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  rpe?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Performance saisie — schéma `Performance` du contrat OpenAPI. */
export class PerformanceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  assignmentId!: string;

  @ApiProperty({ format: 'uuid' })
  athleteId!: string;

  @ApiProperty({ type: ResultsDocDto })
  results!: ResultsDocDto;

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  rpe?: number;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty({ format: 'date-time' })
  submittedAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  @ApiPropertyOptional({
    type: [RecordCandidateDto],
    description: 'Candidats record détectés à la soumission (ADR-20).',
  })
  recordCandidates?: RecordCandidateDto[];
}
