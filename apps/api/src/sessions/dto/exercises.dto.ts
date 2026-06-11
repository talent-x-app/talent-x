import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  Equals,
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

/**
 * Type de regroupement (ADR-27) — sémantique d'affichage/guidage, pas de mécanique :
 * `superset` (enchaîné, numérotation A1/A2), `circuit` (stations), `series` (séries de
 * courses). La mécanique (tours + récup r/R) est identique pour les trois.
 */
export enum GroupType {
  Superset = 'superset',
  Circuit = 'circuit',
  Series = 'series',
}

/**
 * Groupe d'exercices — nœud `kind: "group"` du document `exercises` v3 (ADR-27).
 * **Un seul niveau garanti par construction** : `items` est typé `ExerciseDto[]` (pas
 * d'union récursive) — un groupe ne peut pas contenir de groupe (un nœud groupe
 * imbriqué porte `kind`/`items` inconnus de `ExerciseDto` → rejeté par le whitelist).
 */
export class ExerciseGroupDto {
  @ApiProperty({ enum: ['group'], description: 'Discriminant structurel (ADR-27).' })
  @Equals('group')
  kind!: 'group';

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  order!: number;

  @ApiPropertyOptional({ enum: GroupType, description: "Sémantique d'affichage (défaut circuit)." })
  @IsOptional()
  @IsEnum(GroupType)
  groupType?: GroupType;

  @ApiProperty({ minimum: 1, description: 'Nombre de tours/séries (entier ≥ 1).' })
  @IsInt()
  @Min(1)
  rounds!: number;

  @ApiPropertyOptional({ description: "r — récup entre exercices d'un même tour (s)." })
  @IsOptional()
  @IsInt()
  @Min(0)
  restBetweenItemsSeconds?: number;

  @ApiPropertyOptional({ description: 'R — récup entre tours (s).' })
  @IsOptional()
  @IsInt()
  @Min(0)
  restBetweenRoundsSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [ExerciseDto], description: 'Exercices du groupe (un seul niveau).' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExerciseDto)
  items!: ExerciseDto[];
}

/** Nœud du document `exercises` : exercice simple (sans `kind`) ou groupe (`kind: "group"`). */
export type ExerciseNode = ExerciseDto | ExerciseGroupDto;

/** Garde runtime : le nœud est-il un groupe d'exercices (ADR-27) ? Lecture défensive. */
export function isExerciseGroup(node: unknown): node is ExerciseGroupDto {
  return typeof node === 'object' && node !== null && (node as { kind?: unknown }).kind === 'group';
}

/** Document JSONB des blocs d'une séance — schéma `ExercisesDoc` (cf. TX-DATA-006). */
@ApiExtraModels(ExerciseDto, ExerciseGroupDto)
export class ExercisesDocDto {
  @ApiPropertyOptional({ description: 'Version du contrat JSONB (cf. TX-DATA-006).' })
  @IsOptional()
  @IsInt()
  schemaVersion?: number;

  /**
   * Items ordonnés : exercices simples et/ou groupes (ADR-27). L'union n'a **pas** de
   * discriminant commun (un exercice n'a pas de `kind`) → on instancie chaque élément
   * selon sa forme (présence de `kind`) **avant** validation ; `@ValidateNested` valide
   * alors chaque élément contre sa vraie classe, et le whitelist rejette un groupe
   * imbriqué (champs `kind`/`items` inconnus de `ExerciseDto`) → un seul niveau.
   */
  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [{ $ref: getSchemaPath(ExerciseDto) }, { $ref: getSchemaPath(ExerciseGroupDto) }],
    },
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((el) =>
          isExerciseGroup(el)
            ? plainToInstance(ExerciseGroupDto, el)
            : plainToInstance(ExerciseDto, el),
        )
      : value,
  )
  items!: ExerciseNode[];
}
