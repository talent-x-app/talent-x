import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompetitionDto } from './competition.dto';

/** Statut d'un engagement — schéma `CompetitionEntryStatus` (ADR-24). */
export enum CompetitionEntryStatus {
  Engaged = 'engaged',
  Confirmed = 'confirmed',
  Withdrawn = 'withdrawn',
}

/** Engagement d'un athlète à une compétition — schéma `CompetitionEntry`. */
export class CompetitionEntryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  competitionId!: string;

  @ApiProperty({ format: 'uuid' })
  athleteId!: string;

  @ApiPropertyOptional()
  eventLabel?: string;

  @ApiProperty({ enum: CompetitionEntryStatus })
  status!: CompetitionEntryStatus;

  @ApiPropertyOptional({
    type: CompetitionDto,
    description: 'Compétition embarquée (vue athlète : ses engagements).',
  })
  competition?: CompetitionDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

/** Liste simple d'engagements — schéma `CompetitionEntryList` (réponse d'engagement et de liste). */
export class CompetitionEntryListDto {
  @ApiProperty({ type: [CompetitionEntryDto] })
  data!: CompetitionEntryDto[];
}
