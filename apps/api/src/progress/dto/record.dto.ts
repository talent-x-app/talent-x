import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsIn, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';

/** Familles d'épreuve adressables par un record manuel (ADR-32). */
export const EVENT_FAMILIES = [
  'sprint',
  'hurdles',
  'endurance',
  'interval',
  'jumps',
  'vertical',
  'throws',
] as const;

/** Proposition de record détectée sur une performance — schéma `RecordCandidate` (ADR-20). */
export class RecordCandidateDto {
  @ApiProperty({ description: "Clé d'épreuve dérivée du bloc typé (ex. sprint:60m)." })
  eventKey!: string;

  @ApiProperty({ description: 'Libellé affichable (ex. « 60 m »).' })
  label!: string;

  @ApiProperty({ description: 'Mesure candidate (secondes ou mètres).' })
  value!: number;

  @ApiProperty({ enum: ['s', 'm'] })
  unit!: 's' | 'm';

  @ApiPropertyOptional({ description: 'Record courant battu (absent si première marque).' })
  previousValue?: number;
}

/** Record personnel matérialisé — schéma `PersonalRecord` (ADR-20, TX-DATA-006 §5.7). */
export class PersonalRecordDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  athleteId!: string;

  @ApiProperty()
  eventKey!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  value!: number;

  @ApiProperty({ enum: ['s', 'm'] })
  unit!: 's' | 'm';

  @ApiProperty({ enum: ['min', 'max'] })
  direction!: 'min' | 'max';

  @ApiProperty({ format: 'date' })
  achievedAt!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Performance source (absent si record déclaré manuellement).',
  })
  performanceId?: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

/** Liste de records — schéma `PersonalRecordList`. */
export class PersonalRecordListDto {
  @ApiProperty({ type: [PersonalRecordDto] })
  items!: PersonalRecordDto[];
}

/**
 * Corps de `PUT /athletes/me/records/{eventKey}` — schéma `RecordConfirm`. La valeur est
 * revalidée côté serveur depuis la performance source (pas de valeur libre, ADR-20).
 */
export class RecordConfirmDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  performanceId!: string;
}

/**
 * Corps de `POST /athletes/me/records` — schéma `ManualRecordRequest` (ADR-32). L'athlète
 * **décrit** l'épreuve (famille + paramètre) et déclare une **valeur libre** ; le serveur
 * compose la clé canonique et dérive unité/sens. La cohérence famille↔paramètre est validée
 * côté service (422 `INVALID_EVENT`).
 */
export class ManualRecordRequestDto {
  @ApiProperty({ enum: EVENT_FAMILIES })
  @IsIn(EVENT_FAMILIES)
  family!: (typeof EVENT_FAMILIES)[number];

  @ApiPropertyOptional({ description: 'Distance en mètres (familles chronométrées).' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  distanceMeters?: number;

  @ApiPropertyOptional({ description: "Poids d'engin en kg (throws)." })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  implementKg?: number;

  @ApiPropertyOptional({ enum: ['high', 'pole'], description: 'Discipline (vertical).' })
  @IsOptional()
  @IsIn(['high', 'pole'])
  discipline?: 'high' | 'pole';

  @ApiProperty({ description: 'Marque déclarée (secondes ou mètres selon l’épreuve).' })
  @IsNumber()
  @IsPositive()
  value!: number;

  @ApiPropertyOptional({ format: 'date', description: 'Date de la marque (défaut : aujourd’hui).' })
  @IsOptional()
  @IsISO8601()
  achievedAt?: string;
}
