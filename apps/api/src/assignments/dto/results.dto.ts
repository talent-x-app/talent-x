import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { LoadDto } from '../../sessions/dto/exercises.dto';

/**
 * Résultat d'une série / d'un essai — schéma `SetResult`. Les mesures `timeSeconds`,
 * `distanceMeters` et `failed` relèvent du contrat v2 (ADR-19) ; `durationSeconds` garde
 * sa sémantique v1 de durée *tenue* (entier).
 */
export class SetResultDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  set!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  reps?: number;

  @ApiPropertyOptional({ type: LoadDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LoadDto)
  load?: LoadDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional({ description: 'Temps mesuré (s, décimal — v2, ADR-19).' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  timeSeconds?: number;

  @ApiPropertyOptional({ description: "Distance mesurée de l'essai (m, décimal — v2, ADR-19)." })
  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceMeters?: number;

  @ApiPropertyOptional({ description: 'Essai raté / mordu (v2, ADR-19).' })
  @IsOptional()
  @IsBoolean()
  failed?: boolean;
}

/** Résultats d'un exercice — schéma `ExerciseResult`. */
export class ExerciseResultDto {
  @ApiProperty()
  @IsString()
  exerciseName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({ type: [SetResultDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetResultDto)
  setResults?: SetResultDto[];
}

/** Document JSONB des résultats saisis — schéma `ResultsDoc` (cf. TX-DATA-006). */
export class ResultsDocDto {
  @ApiPropertyOptional({ description: 'Version du contrat JSONB (cf. TX-DATA-006).' })
  @IsOptional()
  @IsInt()
  schemaVersion?: number;

  @ApiProperty({ type: [ExerciseResultDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseResultDto)
  items!: ExerciseResultDto[];
}
