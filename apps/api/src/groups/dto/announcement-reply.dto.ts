import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { GroupTeammateDto } from './group-teammate.dto';

/**
 * Motifs de signalement **bornés** côté serveur (ADR-50 §D3) — miroir du CHECK
 * `ck_announcement_reply_report_reason`. L'ordre est canonique (affichage déterministe).
 */
export const REPLY_REPORT_REASONS = ['spam', 'abuse', 'offensive', 'other'] as const;
export type ReplyReportReason = (typeof REPLY_REPORT_REASONS)[number];

/** Corps d'une réponse de fil (ADR-50) — texte seul, borné ≤ 500 (fil court ≠ annonce ≤ 1000). */
export class AnnouncementReplyCreateDto {
  @ApiProperty({ minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;
}

/** Signalement d'une réponse (ADR-50 §D3) — motif borné par l'enum serveur. */
export class ReplyReportDto {
  @ApiProperty({ enum: REPLY_REPORT_REASONS })
  @IsIn(REPLY_REPORT_REASONS)
  reason!: ReplyReportReason;
}

/**
 * Réponse d'un fil d'annonce (ADR-48 Palier 3 / ADR-50). L'auteur est **minimisé** (identité
 * pair-à-pair ADR-37, `GroupTeammate`) ; un auteur au compte clos est rendu anonyme (« Membre »).
 * Champs de modération exposés selon l'appelant : `mine`/`canDelete`/`reportedByMe` sont la donnée
 * propre de l'appelant ; `hidden`/`reportCount` ne servent que la modération (coach).
 */
export class AnnouncementReplyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  announcementId!: string;

  @ApiProperty({ type: GroupTeammateDto, description: 'Auteur (identité minimisée, ADR-37).' })
  author!: GroupTeammateDto;

  @ApiProperty({ description: 'Corps. Remplacé par un libellé neutre si la réponse est masquée.' })
  body!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ description: "La réponse appartient à l'appelant." })
  mine!: boolean;

  @ApiProperty({ description: "L'appelant peut supprimer (auteur ou coach propriétaire)." })
  canDelete!: boolean;

  @ApiProperty({ description: "L'appelant a déjà signalé cette réponse." })
  reportedByMe!: boolean;

  @ApiProperty({
    description:
      'Masquée par modération (seuil de signalements atteint). Côté membre : corps neutralisé. ' +
      'Côté coach : visible, à trancher.',
  })
  hidden!: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Nombre de signalements distincts — exposé au coach propriétaire uniquement.',
  })
  reportCount?: number;
}

/** Fil de réponses d'une annonce (chronologique croissant) — schéma `AnnouncementReplyList`. */
export class AnnouncementReplyListDto {
  @ApiProperty({ type: [AnnouncementReplyDto] })
  data!: AnnouncementReplyDto[];
}
