import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageMetaDto } from '../../common/pagination/page-meta';
import { CompetitionStatus } from './competition-create.dto';
import { CompetitionEntryStatus } from './competition-entry.dto';

/** Compétition — schéma `Competition` du contrat OpenAPI (ADR-24). */
export class CompetitionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  coachId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  discipline?: string;

  @ApiPropertyOptional()
  location?: string;

  @ApiProperty({ format: 'date' })
  startDate!: string;

  @ApiPropertyOptional({ format: 'date' })
  endDate?: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: CompetitionStatus })
  status!: CompetitionStatus;

  @ApiPropertyOptional({
    enum: CompetitionEntryStatus,
    description:
      "Statut d'engagement du demandeur (athlète engagé) : résumé de ses engagements. Absent côté coach.",
  })
  viewerEntryStatus?: CompetitionEntryStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

/** Page de compétitions — schéma `CompetitionPage`. */
export class CompetitionPageDto {
  @ApiProperty({ type: [CompetitionDto] })
  data!: CompetitionDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
