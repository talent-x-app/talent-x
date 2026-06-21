import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { UserSummaryDto } from './group-member.dto';

/** Corps d'une annonce de groupe — schéma `AnnouncementCreate` (ADR-46). Texte seul, borné. */
export class AnnouncementCreateDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

/** Annonce de groupe — schéma `GroupAnnouncement` (ADR-46). L'auteur est le coach (déjà connu). */
export class GroupAnnouncementDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: UserSummaryDto })
  author!: UserSummaryDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** Liste d'annonces — schéma `GroupAnnouncementList`. */
export class GroupAnnouncementListDto {
  @ApiProperty({ type: [GroupAnnouncementDto] })
  data!: GroupAnnouncementDto[];
}
