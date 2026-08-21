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

/**
 * Identité d'un utilisateur **lié** (relation coach↔athlète), avatar présigné inclus —
 * schéma `LinkedUserSummary` (ADR-37 §A2, TLX-252). Variante **présentée** de `UserSummary`,
 * réservée aux surfaces qui doivent exposer la photo : la décision d'exposition se lit là où
 * elle est prise, plutôt que par effet de bord sur un schéma partagé.
 */
export class LinkedUserSummaryDto extends UserSummaryDto {
  @ApiPropertyOptional({
    description:
      "URL présignée temporaire de l'avatar (TTL AVATAR_URL_TTL_SECONDS). Omise sans photo " +
      'ou si le stockage est indisponible — le client retombe sur les initiales.',
  })
  avatarUrl?: string;
}

/** Appartenance d'un athlète à un groupe — schéma `GroupMember`. */
export class GroupMemberDto {
  @ApiProperty({ format: 'uuid' })
  athleteId!: string;

  @ApiProperty({ format: 'uuid' })
  groupId!: string;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;

  @ApiPropertyOptional({ type: LinkedUserSummaryDto })
  athlete?: LinkedUserSummaryDto;
}

/** Page de membres — schéma `GroupMemberPage`. */
export class GroupMemberPageDto {
  @ApiProperty({ type: [GroupMemberDto] })
  data!: GroupMemberDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
