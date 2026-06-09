import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageMetaDto } from '../../common/pagination/page-meta';

/** Groupe d'entraînement — schéma `Group` du contrat OpenAPI. */
export class GroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ format: 'uuid' })
  coachId!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Code d'invitation actif ; null si révoqué (ADR-16).",
  })
  inviteCode?: string | null;

  @ApiProperty()
  memberCount!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

/** Page de groupes — schéma `GroupPage`. */
export class GroupPageDto {
  @ApiProperty({ type: [GroupDto] })
  data!: GroupDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
