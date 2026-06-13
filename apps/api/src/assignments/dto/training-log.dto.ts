import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ExercisesDocDto } from '../../sessions/dto/exercises.dto';
import { ResultsDocDto } from './results.dto';

/**
 * Corps de `POST /athletes/me/training-log` — schéma `TrainingLogRequest` (ADR-36).
 * L'athlète consigne une séance libre : titre + date + blocs typés (clés d'épreuve) +
 * résultats mesurés + RPE/notes. Le serveur crée atomiquement séance `self_logged` +
 * affectation `completed` + performance.
 */
export class TrainingLogRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ format: 'date', description: "Date de l'entraînement (YYYY-MM-DD)." })
  @IsDateString()
  date!: string;

  @ApiProperty({ type: ExercisesDocDto })
  @ValidateNested()
  @Type(() => ExercisesDocDto)
  exercises!: ExercisesDocDto;

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
