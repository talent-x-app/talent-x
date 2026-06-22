import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { UserSummaryDto } from './group-member.dto';

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
 * Compteur agrégé d'un emoji sur une annonce — schéma `ReactionCount` (ADR-48, Palier 1).
 * **Jamais d'identité** : un emoji + un entier (patron d'agrégat ADR-45).
 */
export class ReactionCountDto {
  @ApiProperty({ enum: ANNOUNCEMENT_REACTION_EMOJIS })
  emoji!: AnnouncementReactionEmoji;

  @ApiProperty({ minimum: 1 })
  count!: number;
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

/** Annonce de groupe — schéma `GroupAnnouncement` (ADR-46 + réactions ADR-48). */
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
}

/** Liste d'annonces — schéma `GroupAnnouncementList`. */
export class GroupAnnouncementListDto {
  @ApiProperty({ type: [GroupAnnouncementDto] })
  data!: GroupAnnouncementDto[];
}
