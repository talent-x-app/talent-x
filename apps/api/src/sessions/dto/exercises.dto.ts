import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
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

/**
 * Type de bloc par discipline — schéma `BlockType` (cf. ADR-18, contrat v2).
 * Un bloc sans `type` est lu comme `custom` (variante générique, rétro-compat v1).
 */
export enum BlockType {
  Strength = 'strength',
  Interval = 'interval',
  Sprint = 'sprint',
  Endurance = 'endurance',
  Hurdles = 'hurdles',
  Jumps = 'jumps',
  VerticalJumps = 'vertical_jumps',
  Throws = 'throws',
  Core = 'core',
  Warmup = 'warmup',
  Cooldown = 'cooldown',
  Custom = 'custom',
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

/** Bloc/exercice typé d'une séance — schéma `Exercise` (contrat v2, cf. ADR-18). */
export class ExerciseDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  order!: number;

  @ApiPropertyOptional({
    enum: BlockType,
    description: 'Type de bloc par discipline (absent = `custom`, cf. ADR-18).',
  })
  @IsOptional()
  @IsEnum(BlockType)
  type?: BlockType;

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

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Paramètres propres au `type` (cadre libre — la forme par discipline est ' +
      'fixée par le ticket de l’éditeur correspondant, TLX-054…061, cf. ADR-18).',
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
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
