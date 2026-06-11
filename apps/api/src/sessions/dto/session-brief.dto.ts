import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/**
 * Notes internes du coach — schéma `CoachNotes` (ADR-28). COACH UNIQUEMENT :
 * retirées de la réponse pour un lecteur athlète par le mapper (cf. `session.mapper.ts`).
 */
export class CoachNotesDto {
  @ApiPropertyOptional({ description: "Variante allégée si l'athlète décroche." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  regression?: string;

  @ApiPropertyOptional({ description: 'Évolution prévue pour la prochaine fois.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  progression?: string;

  @ApiPropertyOptional({ description: 'Point de vigilance que le coach surveille.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caution?: string;
}

/**
 * Couche éditoriale d'une séance — schéma `SessionBrief` (ADR-28, double lecture).
 * Tout est optionnel (brief absent, partiel ou complet) ; aucune contrainte à la
 * création ni à la publication. `intent` + `coachNotes` ne sont JAMAIS sérialisés
 * vers un lecteur athlète (filtrage serveur, cf. `toSessionDto`).
 */
export class SessionBriefDto {
  @ApiPropertyOptional({ description: 'Version du contrat JSONB (cf. TX-DATA-006 §9.x).' })
  @IsOptional()
  @IsInt()
  schemaVersion?: number;

  @ApiPropertyOptional({ description: "Consigne pour l'athlète, en une phrase." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  athleteIntent?: string;

  @ApiPropertyOptional({ description: 'Durée estimée de la séance, en minutes.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Difficulté cible, 1..10.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  difficulty?: number;

  @ApiPropertyOptional({ description: 'Critère de réussite « Réussi si… ».' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  successCriteria?: string;

  @ApiPropertyOptional({ description: "Règle d'arrêt « Stop si… », dite à l'athlète." })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  stopCriteria?: string;

  @ApiPropertyOptional({
    description: "Intention d'entraînement du jour — COACH UNIQUEMENT (absent pour un athlète).",
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  intent?: string;

  @ApiPropertyOptional({
    type: CoachNotesDto,
    description: 'Notes internes — COACH UNIQUEMENT (absent pour un athlète).',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CoachNotesDto)
  coachNotes?: CoachNotesDto;
}
