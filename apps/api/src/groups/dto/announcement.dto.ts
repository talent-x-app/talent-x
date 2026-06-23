import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { UserSummaryDto } from './group-member.dto';
import { GroupTeammateDto } from './group-teammate.dto';

/**
 * Jeu d'emoji **borné** des réactions d'annonce (ADR-48, Palier 1) — source de vérité côté
 * serveur, miroir du CHECK `ck_announcement_reaction_emoji`. L'ordre est canonique : il fixe
 * l'ordre d'affichage des compteurs (rendu déterministe, « zéro valeur en dur » côté front).
 */
export const ANNOUNCEMENT_REACTION_EMOJIS = ['❤️', '🔥', '👏', '💪', '😮'] as const;
export type AnnouncementReactionEmoji = (typeof ANNOUNCEMENT_REACTION_EMOJIS)[number];

/** Corps d'une annonce de groupe — schéma `AnnouncementCreate` (ADR-46). Texte seul, borné. */
export class AnnouncementCreateDto {
  @ApiProperty({ minLength: 1, maxLength: 1000 })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

/**
 * Compteur d'un emoji sur une annonce avec ses auteurs minimisés — schéma `ReactionCount`
 * (ADR-48 Palier 2, ADR-49 D1). `count` = total exact ; `reactors` = identités minimisées
 * (`GroupTeammate`, ADR-37) **plafonnées** (`REACTION_REACTORS_CAP`, défaut 8) → l'UI rend
 * « ❤️ par Léa, Karim +6 ». Auteurs = co-membres actifs du même groupe (TX-DPIA-007 §5.5).
 */
export class ReactionCountDto {
  @ApiProperty({ enum: ANNOUNCEMENT_REACTION_EMOJIS })
  emoji!: AnnouncementReactionEmoji;

  @ApiProperty({ minimum: 1 })
  count!: number;

  @ApiProperty({
    type: [GroupTeammateDto],
    description: 'Auteurs (identité minimisée), plafonnés ; peut être plus court que `count`.',
  })
  reactors!: GroupTeammateDto[];
}

/**
 * État des réactions d'une annonce — schéma `AnnouncementReactions` (ADR-48, Palier 1).
 * Renvoyé par pose/retrait pour rafraîchir l'UI sans refetch. `myReactions` = les emoji posés
 * par **l'appelant** (sa propre donnée, pas un tiers).
 */
export class AnnouncementReactionsDto {
  @ApiProperty({ type: [ReactionCountDto] })
  reactions!: ReactionCountDto[];

  @ApiProperty({ enum: ANNOUNCEMENT_REACTION_EMOJIS, isArray: true })
  myReactions!: AnnouncementReactionEmoji[];
}

/**
 * Accusé de lecture agrégé d'une annonce — schéma `AnnouncementReadReceipt` (ADR-48, Palier 1).
 * « 9/12 ont lu » : deux entiers, **jamais la liste** des lecteurs (patron d'agrégat ADR-45).
 */
export class AnnouncementReadReceiptDto {
  @ApiProperty({ minimum: 0, description: 'Nombre de membres ayant lu.' })
  readCount!: number;

  @ApiProperty({ minimum: 0, description: 'Nombre de membres actifs du groupe.' })
  memberCount!: number;
}

/** Annonce de groupe — schéma `GroupAnnouncement` (ADR-46 + réactions/lecture ADR-48). */
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

  @ApiProperty({ type: [ReactionCountDto], description: 'Compteurs agrégés par emoji (ADR-48).' })
  reactions!: ReactionCountDto[];

  @ApiProperty({
    enum: ANNOUNCEMENT_REACTION_EMOJIS,
    isArray: true,
    description: "Emoji posés par l'appelant (sa propre donnée).",
  })
  myReactions!: AnnouncementReactionEmoji[];

  @ApiProperty({ minimum: 0, description: 'Membres ayant lu (agrégat ADR-48).' })
  readCount!: number;

  @ApiProperty({ minimum: 0, description: 'Membres actifs du groupe.' })
  memberCount!: number;
}

/** Liste d'annonces — schéma `GroupAnnouncementList`. */
export class GroupAnnouncementListDto {
  @ApiProperty({ type: [GroupAnnouncementDto] })
  data!: GroupAnnouncementDto[];
}
