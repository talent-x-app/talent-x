import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Vue pair-à-pair d'un membre de groupe (ADR-37) — schéma `GroupTeammate`. Strictement
 * minimisée : identité + avatar présigné uniquement (ni e-mail, ni discipline, ni donnée
 * de performance/santé). Schéma dédié (≠ `GroupMember`/`UserSummary`) pour borner ce qui
 * est exposé à un pair, comme ADR-26 a préféré `AthleteGroup` à `Group` pour `inviteCode`.
 */
export class GroupTeammateDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional({ description: "URL présignée temporaire de l'avatar." })
  avatarUrl?: string;
}

/** Liste (bornée, non paginée) des coéquipiers — schéma `GroupTeammateList`. */
export class GroupTeammateListDto {
  @ApiProperty({ type: [GroupTeammateDto] })
  data!: GroupTeammateDto[];
}
