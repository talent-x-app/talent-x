import { ApiProperty } from '@nestjs/swagger';

/**
 * Pouls d'équipe (ADR-48, Palier 1) — **100 % dérivé**, zéro champ stocké. Agrégats sur les
 * `SessionAssignment` du groupe (fan-out ADR-30) pour la **semaine en cours** : gamification
 * douce, **collective et anonyme** (jamais de classement individuel ni de perf comparée entre
 * pairs — frontière santé/perf ADR-08/21). Tous les champs sont des entiers agrégés.
 */
export class TeamPulseDto {
  @ApiProperty({
    format: 'date',
    description: 'Lundi de la semaine ISO couverte (contexte du calcul).',
  })
  weekStart!: string;

  @ApiProperty({ minimum: 0, description: 'Séances du groupe terminées cette semaine.' })
  completedSessions!: number;

  @ApiProperty({ minimum: 0, description: 'Records personnels déclenchés cette semaine (groupe).' })
  personalRecords!: number;

  @ApiProperty({
    type: 'integer',
    minimum: 0,
    maximum: 100,
    nullable: true,
    description:
      'Taux de présence (% « going » parmi les réponses RSVP de la semaine). null si aucune réponse.',
  })
  attendanceRate!: number | null;
}
