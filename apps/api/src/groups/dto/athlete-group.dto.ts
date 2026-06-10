import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserSummaryDto } from './group-member.dto';

/**
 * Vue athlète d'un de ses groupes (ADR-26) — schéma `AthleteGroup`. Distinct de
 * `GroupDto` (vue coach) : n'expose **jamais** le code d'invitation, réservé au
 * coach propriétaire (ADR-16), et porte le résumé du coach pour « Mon coach ».
 */
export class AthleteGroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;

  @ApiProperty({ type: UserSummaryDto })
  coach!: UserSummaryDto;
}

/** Liste (bornée, non paginée) des groupes actifs de l'athlète — schéma `AthleteGroupList`. */
export class AthleteGroupListDto {
  @ApiProperty({ type: [AthleteGroupDto] })
  data!: AthleteGroupDto[];
}
