import { ApiProperty } from '@nestjs/swagger';
import { StatsMetricsDto } from './stats.dto';

/** Point d'une série de progression — schéma `ProgressPoint` (ADR-21). */
export class ProgressPointDto {
  @ApiProperty({ format: 'date' })
  date!: string;

  @ApiProperty()
  value!: number;
}

/**
 * Série de progression d'une épreuve — schéma `ProgressSeries` (ADR-21) : un point par
 * performance soumise qui mesure l'épreuve (clé ADR-20).
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
