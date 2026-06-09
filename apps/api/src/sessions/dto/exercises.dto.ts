import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Unité de charge — schéma `Load.unit` du contrat. */
export enum LoadUnit {
  Kg = 'kg',
  Lb = 'lb',
  Percent1Rm = 'percent_1rm',
  Bodyweight = 'bodyweight',
}

/** Charge prescrite d'un exercice — schéma `Load`. */
export class LoadDto {
  @ApiProperty()
  @IsNumber()
  value!: number;

  @ApiProperty({ enum: LoadUnit })
  @IsEnum(LoadUnit)
  unit!: LoadUnit;
}

/** Bloc/exercice typé d'une séance — schéma `Exercise`. */
export class ExerciseDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  order!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sets?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  reps?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  durationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  restSeconds?: number;

  @ApiPropertyOptional({ type: LoadDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LoadDto)
  load?: LoadDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Document JSONB des blocs d'une séance — schéma `ExercisesDoc` (cf. TX-DATA-006). */
export class ExercisesDocDto {
  @ApiPropertyOptional({ description: 'Version du contrat JSONB (cf. TX-DATA-006).' })
  @IsOptional()
  @IsInt()
  schemaVersion?: number;

  @ApiProperty({ type: [ExerciseDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  items!: ExerciseDto[];
}
