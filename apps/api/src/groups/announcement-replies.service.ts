import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationQueueService } from '../jobs/notification-queue.service';
import { TeammatePresenter, type MinimalAthlete } from '../storage/teammate-presenter.service';
import {
  AnnouncementReplyCreateDto,
  AnnouncementReplyDto,
  AnnouncementReplyListDto,
  ReplyReportReason,
} from './dto/announcement-reply.dto';

/** Seuil de signalements distincts au-delà duquel une réponse est masquée aux non-coachs (ADR-50 §D3). */
const DEFAULT_REPORTS_HIDE_THRESHOLD = 3;
/** Plafond anti-spam : réponses vivantes d'un même auteur sous une même annonce (ADR-50 §D3). */
const DEFAULT_MAX_REPLIES_PER_AUTHOR = 30;
/** Corps de substitution d'une réponse masquée (rendu côté membre — jamais le texte signalé). */
const HIDDEN_BODY = 'Réponse masquée en attendant la modération.';

/** Sélection minimisée de l'auteur (identité + avatar) + son état de compte (anonymisation ADR-37). */
const AUTHOR_SELECT = {
  select: { id: true, firstName: true, lastName: true, photoUrl: true, deletedAt: true },
} as const;

type ReplyRow = {
  id: string;
  announcementId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    deletedAt: Date | null;
  };
  reports: { reporterId: string }[];
};

/**
 * Fil de réponses sous une annonce (ADR-48 Palier 3 / ADR-50) — **bidirectionnel** : coach et
 * membres actifs répondent à égalité. Modération native (non négociable) : suppression par
 * l'auteur **ou** le coach propriétaire, signalement communautaire, masquage automatique sur seuil,
 * et plafond anti-spam. Contenu rédigé par un pair → auteur minimisé (ADR-37), purge à l'effacement
 * du compte par FK CASCADE (ADR-15). 404 anti-énumération hors périmètre.
 */
@Injectable()
export class AnnouncementRepliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly teammates: TeammatePresenter,
    private readonly config: ConfigService,
  ) {}

  private hideThreshold(): number {
    return (
      this.config.get<number>('REPLY_REPORTS_HIDE_THRESHOLD') ?? DEFAULT_REPORTS_HIDE_THRESHOLD
    );
  }

  private maxRepliesPerAuthor(): number {
    return (
      this.config.get<number>('REPLY_MAX_PER_ANNOUNCEMENT_PER_AUTHOR') ??
      DEFAULT_MAX_REPLIES_PER_AUTHOR
    );
  }

  /** Liste le fil d'une annonce (chronologique croissant). RBAC : coach propriétaire OU membre actif. */
  async listReplies(
    user: AuthenticatedUser,
    groupId: string,
    announcementId: string,
  ): Promise<AnnouncementReplyListDto> {
    const isCoachOwner = await this.assertCanRead(user, groupId);
    await this.assertAnnouncementInGroup(groupId, announcementId);
    const rows = await this.prisma.announcementReply.findMany({
      where: { announcementId, deletedAt: null },
      include: { author: AUTHOR_SELECT, reports: { select: { reporterId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const data = await this.presentMany(rows, user.id, isCoachOwner);
    return { data };
  }

  /**
   * Publie une réponse (coach propriétaire OU membre actif). Garde anti-spam : plafond de réponses
   * vivantes du même auteur sous cette annonce (422 sinon). Notifie **l'auteur de l'annonce** seul
   * (anti-bruit, ADR-50 §D5), jamais soi-même.
   */
  async createReply(
    user: AuthenticatedUser,
    groupId: string,
    announcementId: string,
    dto: AnnouncementReplyCreateDto,
  ): Promise<AnnouncementReplyDto> {
    const isCoachOwner = await this.assertCanRead(user, groupId);
    const announcement = await this.assertAnnouncementInGroup(groupId, announcementId);

    const own = await this.prisma.announcementReply.count({
      where: { announcementId, authorId: user.id, deletedAt: null },
    });
    if (own >= this.maxRepliesPerAuthor()) {
      throw new UnprocessableEntityException({
        error: 'REPLY_RATE_LIMITED',
        message: 'Trop de réponses sur cette annonce. Réessaie plus tard.',
      });
    }

    const created = await this.prisma.announcementReply.create({
      data: { announcementId, authorId: user.id, body: dto.body },
      include: { author: AUTHOR_SELECT, reports: { select: { reporterId: true } } },
    });

    // Notifie l'auteur de l'annonce (coach), sauf s'il répond à lui-même. resourceId = groupe.
    if (announcement.authorId !== user.id) {
      await this.notificationQueue.enqueue(
        {
          type: 'group_reply',
          recipientUserId: announcement.authorId,
          resourceId: groupId,
          // Acteur (ADR-55) = l'auteur de la réponse.
          actorId: user.id,
        },
        `group_reply--${created.id}--${announcement.authorId}`,
      );
    }
    return this.present(created, user.id, isCoachOwner);
  }

  /**
   * Supprime (soft) une réponse. Autorisé à l'**auteur** de la réponse OU au **coach propriétaire**
   * du groupe (ADR-50 §D3). `deletedById` trace l'acteur (retrait auteur vs modération). 404 hors
   * périmètre, 403 si ni auteur ni coach.
   */
  async deleteReply(
    user: AuthenticatedUser,
    groupId: string,
    announcementId: string,
    replyId: string,
  ): Promise<void> {
    const isCoachOwner = await this.assertCanRead(user, groupId);
    await this.assertAnnouncementInGroup(groupId, announcementId);
    const reply = await this.prisma.announcementReply.findFirst({
      where: { id: replyId, announcementId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!reply) throw new NotFoundException('Réponse introuvable.');
    if (reply.authorId !== user.id && !isCoachOwner) {
      throw new ForbiddenException('Suppression réservée à l’auteur ou au coach.');
    }
    await this.prisma.announcementReply.update({
      where: { id: reply.id },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
  }

  /**
   * Signale une réponse (ADR-50 §D3) — idempotent (unique `(reply, reporter)`). Interdit de signaler
   * sa propre réponse (422). Renvoie la réponse à jour pour le signaleur (`reportedByMe`, et masquage
   * si le seuil est atteint).
   */
  async reportReply(
    user: AuthenticatedUser,
    groupId: string,
    announcementId: string,
    replyId: string,
    reason: ReplyReportReason,
  ): Promise<AnnouncementReplyDto> {
    const isCoachOwner = await this.assertCanRead(user, groupId);
    await this.assertAnnouncementInGroup(groupId, announcementId);
    const reply = await this.prisma.announcementReply.findFirst({
      where: { id: replyId, announcementId, deletedAt: null },
      select: { id: true, authorId: true },
    });
    if (!reply) throw new NotFoundException('Réponse introuvable.');
    if (reply.authorId === user.id) {
      throw new UnprocessableEntityException({
        error: 'REPLY_REPORT_SELF_FORBIDDEN',
        message: 'On ne peut pas signaler sa propre réponse.',
      });
    }
    await this.prisma.announcementReplyReport.upsert({
      where: { replyId_reporterId: { replyId, reporterId: user.id } },
      create: { replyId, reporterId: user.id, reason },
      update: {},
    });

    const fresh = await this.prisma.announcementReply.findFirstOrThrow({
      where: { id: replyId },
      include: { author: AUTHOR_SELECT, reports: { select: { reporterId: true } } },
    });
    return this.present(fresh, user.id, isCoachOwner);
  }

  /** Présente une liste de réponses (avatars présignés en une passe, anti N+1). */
  private async presentMany(
    rows: ReplyRow[],
    userId: string,
    isCoachOwner: boolean,
  ): Promise<AnnouncementReplyDto[]> {
    // Présigne les avatars des auteurs **actifs** distincts en une fois.
    const distinct = new Map<string, MinimalAthlete>();
    for (const r of rows) {
      if (!r.author.deletedAt) distinct.set(r.author.id, r.author);
    }
    const presented = new Map(
      (await this.teammates.presentMany([...distinct.values()])).map((t) => [t.id, t]),
    );
    return rows.map((r) => this.toDto(r, userId, isCoachOwner, presented.get(r.author.id)));
  }

  /** Présente une **seule** réponse (avatar présigné best-effort). */
  private async present(
    row: ReplyRow,
    userId: string,
    isCoachOwner: boolean,
  ): Promise<AnnouncementReplyDto> {
    const author = row.author.deletedAt ? undefined : await this.teammates.present(row.author);
    return this.toDto(row, userId, isCoachOwner, author);
  }

  /**
   * Mappe une ligne vers le DTO. Auteur au compte clos → anonyme (`{ id }`, l'UI rend « Membre »).
   * `hidden` = seuil de signalements atteint : masqué aux **non-coachs** (corps neutralisé) ;
   * `reportCount` n'est exposé qu'au **coach propriétaire** (modération).
   */
  private toDto(
    row: ReplyRow,
    userId: string,
    isCoachOwner: boolean,
    author: { id: string; firstName?: string; lastName?: string; avatarUrl?: string } | undefined,
  ): AnnouncementReplyDto {
    const reportCount = row.reports.length;
    const hidden = reportCount >= this.hideThreshold();
    const mine = row.authorId === userId;
    // Masqué aux non-coachs (sauf à son propre auteur, qui voit que sa réponse est masquée).
    const maskBody = hidden && !isCoachOwner && !mine;
    return {
      id: row.id,
      announcementId: row.announcementId,
      author: author ?? { id: row.author.id },
      body: maskBody ? HIDDEN_BODY : row.body,
      createdAt: row.createdAt.toISOString(),
      mine,
      canDelete: mine || isCoachOwner,
      reportedByMe: row.reports.some((rep) => rep.reporterId === userId),
      hidden,
      ...(isCoachOwner ? { reportCount } : {}),
    };
  }

  /** Vérifie que l'annonce existe dans ce groupe et n'est pas supprimée ; renvoie son auteur. */
  private async assertAnnouncementInGroup(
    groupId: string,
    announcementId: string,
  ): Promise<{ authorId: string }> {
    const announcement = await this.prisma.groupAnnouncement.findFirst({
      where: { id: announcementId, groupId, deletedAt: null },
      select: { authorId: true },
    });
    if (!announcement) throw new NotFoundException('Annonce introuvable.');
    return announcement;
  }

  /**
   * Lecture/écriture autorisée : coach propriétaire OU athlète membre actif (404 anti-énumération
   * sinon). Renvoie `true` si l'appelant est le **coach propriétaire** (pouvoirs de modération).
   */
  private async assertCanRead(user: AuthenticatedUser, groupId: string): Promise<boolean> {
    if (user.role === 'coach') {
      const group = await this.prisma.group.findFirst({
        where: { id: groupId, deletedAt: null, coachId: user.id },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Groupe introuvable.');
      return true;
    }
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, athleteId: user.id, leftAt: null, group: { deletedAt: null } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Groupe introuvable.');
    return false;
  }
}
