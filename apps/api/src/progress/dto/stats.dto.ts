import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Indicateurs dérivés pour un athlète (sur les séances du coach demandeur). */
export class StatsMetricsDto {
  @ApiProperty({ description: 'Affectations actives (non supprimées).' })
  assignmentsTotal!: number;

  @ApiProperty({ description: 'Affectations réalisées (status completed).' })
  completed!: number;

  @ApiProperty({ description: 'Affectations échues non réalisées (exclut skipped).' })
  missed!: number;

  @ApiProperty({ description: 'Affectations skipped (indispo, ADR-31) — exclues de l’assiduité.' })
  skipped!: number;

  @ApiProperty({
    description: 'Taux d’assiduité = completed / (total − skipped), 0..1, arrondi à 0,01.',
  })
  completionRate!: number;

  @ApiPropertyOptional({ description: 'RPE moyen des performances soumises (1..10).' })
  avgRpe?: number;

  @ApiPropertyOptional({ format: 'date-time', description: 'Dernière performance soumise.' })
  lastPerformanceAt?: string;
}

/** Statistiques d'un athlète — schéma `Stats` (dérivations TLX-080, consent-gated). */
export class StatsDto {
  @ApiProperty({ format: 'uuid' })
  athleteId!: string;

  @ApiProperty({ type: StatsMetricsDto })
  metrics!: StatsMetricsDto;
}
