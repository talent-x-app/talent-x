import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatsMetricsDto } from './stats.dto';

/** Point d'une série de progression — schéma `ProgressPoint` (ADR-21). */
export class ProgressPointDto {
  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty()
  value!: number;
}

/** Meilleure marque d'une année civile — schéma `ProgressMarkByYear` (ADR-34). */
export class ProgressMarkByYearDto {
  @ApiProperty({ description: 'Année civile.' })
  year!: number;

  @ApiProperty({ description: 'Meilleure marque de l’année (sens de l’épreuve).' })
  best!: number;

  @ApiProperty({ description: 'Nombre de marques enregistrées cette année-là.' })
  count!: number;
}

/**
 * Série de progression d'une épreuve — schéma `ProgressSeries` (ADR-21, étendu ADR-34) : un
 * point par performance soumise qui mesure l'épreuve (clé ADR-20), plus le **SB** de l'année
 * en cours et le **tableau des marques par année** (dérivés, le PB restant à `personal_records`).
 */
export class ProgressSeriesDto {
  @ApiProperty({ description: "Clé d'épreuve dérivée du bloc typé (ex. sprint:60m)." })
  eventKey!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: ['s', 'm'] })
  unit!: 's' | 'm';

  @ApiProperty({ enum: ['min', 'max'] })
  direction!: 'min' | 'max';

  @ApiProperty({ type: [ProgressPointDto] })
  points!: ProgressPointDto[];

  @ApiPropertyOptional({
    type: ProgressPointDto,
    description: 'Meilleure marque de l’année civile en cours (SB) — absent si aucune (ADR-34).',
  })
  seasonBest?: ProgressPointDto;

  @ApiProperty({
    type: [ProgressMarkByYearDto],
    description: 'Marques par année civile, décroissant (ADR-34).',
  })
  marksByYear!: ProgressMarkByYearDto[];
}

/** Progression de l'athlète connecté — schéma `Progress` (ADR-21). */
export class ProgressDto {
  @ApiProperty({ format: 'uuid' })
  athleteId!: string;

  @ApiProperty({ type: StatsMetricsDto })
  metrics!: StatsMetricsDto;

  @ApiProperty({ type: [ProgressSeriesDto] })
  series!: ProgressSeriesDto[];
}
