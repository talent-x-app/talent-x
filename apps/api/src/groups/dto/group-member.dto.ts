import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageMetaDto } from '../../common/pagination/page-meta';

/** Résumé public d'un utilisateur — schéma `UserSummary`. */
export class UserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  sport?: string;
}

/** Appartenance d'un athlète à un groupe — schéma `GroupMember`. */
export class GroupMemberDto {
  @ApiProperty({ format: 'uuid' })
  athleteId!: string;

  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;

  @ApiPropertyOptional({ type: UserSummaryDto })
  athlete?: UserSummaryDto;
}

/** Page de membres — schéma `GroupMemberPage`. */
export class GroupMemberPageDto {
  @ApiProperty({ type: [GroupMemberDto] })
  data!: GroupMemberDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
