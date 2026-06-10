import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Statut d'une compétition — schéma `CompetitionStatus` (ADR-24). */
export enum CompetitionStatus {
  Draft = 'draft',
  Published = 'published',
  Cancelled = 'cancelled',
}

/** Corps de `POST /competitions` — schéma `CompetitionCreate`. */
export class CompetitionCreateDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: 'Discipline libre au MVP (ex. « Sprint »).' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  discipline?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiProperty({ format: 'date', description: 'Jour de début (YYYY-MM-DD).' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ format: 'date', description: 'Jour de fin (≥ startDate).' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: CompetitionStatus, description: 'Défaut : draft.' })
  @IsOptional()
  @IsEnum(CompetitionStatus)
  status?: CompetitionStatus;
}
