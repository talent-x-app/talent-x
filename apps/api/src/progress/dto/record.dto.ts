import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

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
