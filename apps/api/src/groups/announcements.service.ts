import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GroupAnnouncement, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationQueueService } from '../jobs/notification-queue.service';
import { TeammatePresenter, type MinimalAthlete } from '../storage/teammate-presenter.service';
import {
  ANNOUNCEMENT_REACTION_EMOJIS,
  AnnouncementCreateDto,
  AnnouncementReactionEmoji,
  AnnouncementReactionsDto,
  AnnouncementReadReceiptDto,
  GroupAnnouncementDto,
  GroupAnnouncementListDto,
} from './dto/announcement.dto';

/** Plafond d'auteurs de réaction exposés par emoji (ADR-49 D1) — surchargeable par env. */
const DEFAULT_REACTION_REACTORS_CAP = 8;

type AnnouncementWithAuthor = GroupAnnouncement & {
  author: Pick<User, 'id' | 'firstName' | 'lastName' | 'sport'>;
};

/** Réactions d'une annonce, prêtes pour le DTO : compteurs agrégés + emoji propres de l'appelant. */
type ReactionView = Pick<GroupAnnouncementDto, 'reactions' | 'myReactions'>;

/** Méta d'une annonce pour le DTO : réactions agrégées + accusé de lecture agrégé (jamais d'identité). */
type AnnouncementMeta = ReactionView & Pick<GroupAnnouncementDto, 'readCount' | 'memberCount'>;

const AUTHOR_SELECT = {
  author: { select: { id: true, firstName: true, lastName: true, sport: true } },
} as const;

/**
 * Annonces de groupe (ADR-46) — canal descendant coach → membres. Le **coach propriétaire** publie
 * et supprime ; les **membres actifs** (et le coach) lisent. À la publication, fan-out d'une
 * notification `group_announcement` à chaque membre actif (sauf l'auteur), réutilisant l'infra
 * ADR-22/23 (gardée par la préférence `groupUpdates`). 404 anti-énumération hors périmètre.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationQueue: NotificationQueueService,
    private readonly teammates: TeammatePresenter,
    private readonly config: ConfigService,
  ) {}

  /** Plafond d'auteurs exposés par emoji (réactions nominatives, ADR-49 D1). */
  private reactorsCap(): number {
    return this.config.get<number>('REACTION_REACTORS_CAP') ?? DEFAULT_REACTION_REACTORS_CAP;
  }

  /** Liste les annonces (récentes d'abord). RBAC : coach propriétaire OU membre actif. */
  async listAnnouncements(
    user: AuthenticatedUser,
    groupId: string,
  ): Promise<GroupAnnouncementListDto> {
    await this.assertCanRead(user, groupId);
    const rows = await this.prisma.groupAnnouncement.findMany({
      where: { groupId, deletedAt: null },
      include: AUTHOR_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    const ids = rows.map((r) => r.id);

    // Agrégats en une passe (anti N+1), tous au patron ADR-45 : compteurs, jamais d'identité.
    const [reactions, readCounts, memberCount] = await Promise.all([
      this.reactionViews(ids, user.id, groupId),
      this.readCounts(ids),
      ids.length > 0 ? this.activeMemberCount(groupId) : Promise.resolve(0),
    ]);

    return {
      data: rows.map((row) =>
        toAnnouncementDto(row, {
          ...(reactions.get(row.id) ?? emptyReactions()),
          readCount: readCounts.get(row.id) ?? 0,
          memberCount,
        }),
      ),
    };
  }

  /**
   * Pose une réaction emoji sur une annonce (ADR-48, Palier 1) — **idempotent** (PUT), un emoji
   * par personne. RBAC = lecture du groupe (coach propriétaire OU membre actif). Le contrat ne
   * ressort que des **compteurs agrégés** + les emoji de l'appelant : jamais l'identité d'un tiers.
   */
  async addReaction(
    user: AuthenticatedUser,
    groupId: string,
    announcementId: string,
    emoji: string,
  ): Promise<AnnouncementReactionsDto> {
    const validEmoji = this.assertEmoji(emoji);
    await this.assertCanRead(user, groupId);
    await this.assertAnnouncementInGroup(groupId, announcementId);
    await this.prisma.announcementReaction.upsert({
      where: {
        announcementId_userId_emoji: { announcementId, userId: user.id, emoji: validEmoji },
      },
      create: { announcementId, userId: user.id, emoji: validEmoji },
      update: {},
    });
    return this.reactionSummary(announcementId, user.id, groupId);
  }

  /** Retire une réaction emoji (ADR-48) — **idempotent** (DELETE sans erreur si absente). */
  async removeReaction(
    user: AuthenticatedUser,
    groupId: string,
    announcementId: string,
    emoji: string,
  ): Promise<AnnouncementReactionsDto> {
    const validEmoji = this.assertEmoji(emoji);
    await this.assertCanRead(user, groupId);
    await this.assertAnnouncementInGroup(groupId, announcementId);
    await this.prisma.announcementReaction.deleteMany({
      where: { announcementId, userId: user.id, emoji: validEmoji },
    });
    return this.reactionSummary(announcementId, user.id, groupId);
  }

  /**
   * Marque une annonce comme **lue** par l'appelant (ADR-48, Palier 1) — **idempotent** (upsert
   * sur la PK composite). Réservé aux **membres actifs** (le coach est l'auteur, pas un lecteur
   * comptabilisé). Renvoie l'agrégat `readCount`/`memberCount` (« 9/12 ont lu ») — jamais la liste.
   */
  async markRead(
    user: AuthenticatedUser,
    groupId: string,
    announcementId: string,
  ): Promise<AnnouncementReadReceiptDto> {
    await this.assertActiveMember(user.id, groupId);
    await this.assertAnnouncementInGroup(groupId, announcementId);
    await this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId, userId: user.id } },
      create: { announcementId, userId: user.id },
      update: {},
    });
    const [readCount, memberCount] = await Promise.all([
      this.prisma.announcementRead.count({ where: { announcementId } }),
      this.activeMemberCount(groupId),
    ]);
    return { readCount, memberCount };
  }

  /** Publie une annonce (coach propriétaire) + notifie les membres actifs (sauf l'auteur). */
  async createAnnouncement(
    coachId: string,
    groupId: string,
    dto: AnnouncementCreateDto,
  ): Promise<GroupAnnouncementDto> {
    await this.assertGroupOwnedByCoach(coachId, groupId);
    const created = await this.prisma.groupAnnouncement.create({
      data: { groupId, authorId: coachId, body: dto.body },
      include: AUTHOR_SELECT,
    });

    // Fan-out notification aux membres actifs (hors auteur). resourceId = groupId → ouvre le groupe.
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, leftAt: null, athleteId: { not: coachId } },
      select: { athleteId: true },
    });
    for (const { athleteId } of members) {
      await this.notificationQueue.enqueue(
        { type: 'group_announcement', recipientUserId: athleteId, resourceId: groupId },
        `group_announcement--${created.id}--${athleteId}`,
      );
    }
    // Annonce fraîche : aucune réaction ni lecture ; memberCount = membres notifiés (= actifs).
    return toAnnouncementDto(created, {
      ...emptyReactions(),
      readCount: 0,
      memberCount: members.length,
    });
  }

  /** Supprime (soft) une annonce de son groupe (coach propriétaire). 404 sinon. */
  async deleteAnnouncement(
    coachId: string,
    groupId: string,
    announcementId: string,
  ): Promise<void> {
    await this.assertGroupOwnedByCoach(coachId, groupId);
    const announcement = await this.prisma.groupAnnouncement.findFirst({
      where: { id: announcementId, groupId, deletedAt: null },
      select: { id: true },
    });
    if (!announcement) throw new NotFoundException('Annonce introuvable.');
    await this.prisma.groupAnnouncement.update({
      where: { id: announcement.id },
      data: { deletedAt: new Date() },
    });
  }

  /** Valide l'emoji contre le jeu borné serveur (422 sinon) — défense en profondeur du CHECK base. */
  private assertEmoji(emoji: string): AnnouncementReactionEmoji {
    if (!(ANNOUNCEMENT_REACTION_EMOJIS as readonly string[]).includes(emoji)) {
      throw new UnprocessableEntityException({
        error: 'REACTION_EMOJI_INVALID',
        message: `Emoji non autorisé. Valeurs admises : ${ANNOUNCEMENT_REACTION_EMOJIS.join(' ')}.`,
      });
    }
    return emoji as AnnouncementReactionEmoji;
  }

  /** Vérifie que l'annonce existe dans ce groupe et n'est pas supprimée (404 anti-énumération). */
  private async assertAnnouncementInGroup(groupId: string, announcementId: string): Promise<void> {
    const announcement = await this.prisma.groupAnnouncement.findFirst({
      where: { id: announcementId, groupId, deletedAt: null },
      select: { id: true },
    });
    if (!announcement) throw new NotFoundException('Annonce introuvable.');
  }

  /** État des réactions d'une **seule** annonce pour l'appelant (compteurs + auteurs + ses emoji). */
  private async reactionSummary(
    announcementId: string,
    userId: string,
    groupId: string,
  ): Promise<AnnouncementReactionsDto> {
    return (
      (await this.reactionViews([announcementId], userId, groupId)).get(announcementId) ??
      emptyReactions()
    );
  }

  /**
   * Agrège les réactions de plusieurs annonces en une passe (anti N+1) : compteurs exacts par
   * emoji (`groupBy`), **auteurs minimisés plafonnés** (ADR-49 D1, `GroupTeammate`) et emoji posés
   * par l'appelant. Les auteurs sont **bornés aux membres actifs** du groupe (exclut partis et
   * comptes anonymisés, ADR-37) — `count` reste le total exact (`reactors` peut être plus court).
   * Ordre des compteurs = ordre canonique du jeu borné (rendu déterministe).
   */
  private async reactionViews(
    announcementIds: string[],
    userId: string,
    groupId: string,
  ): Promise<Map<string, ReactionView>> {
    const views = new Map<string, ReactionView>();
    if (announcementIds.length === 0) return views;

    const cap = this.reactorsCap();
    const [counts, mine, reactorRows] = await Promise.all([
      this.prisma.announcementReaction.groupBy({
        by: ['announcementId', 'emoji'],
        where: { announcementId: { in: announcementIds } },
        _count: { id: true },
      }),
      this.prisma.announcementReaction.findMany({
        where: { announcementId: { in: announcementIds }, userId },
        select: { announcementId: true, emoji: true },
      }),
      // Auteurs minimisés : membres ACTIFS du groupe uniquement (exclut partis/anonymisés).
      this.prisma.announcementReaction.findMany({
        where: {
          announcementId: { in: announcementIds },
          user: { deletedAt: null, groupMemberships: { some: { groupId, leftAt: null } } },
        },
        select: {
          announcementId: true,
          emoji: true,
          user: { select: { id: true, firstName: true, lastName: true, photoUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const countByAnnouncement = new Map<string, Map<string, number>>();
    for (const row of counts) {
      const map = countByAnnouncement.get(row.announcementId) ?? new Map<string, number>();
      map.set(row.emoji, row._count.id);
      countByAnnouncement.set(row.announcementId, map);
    }
    const mineByAnnouncement = new Map<string, Set<string>>();
    for (const row of mine) {
      const set = mineByAnnouncement.get(row.announcementId) ?? new Set<string>();
      set.add(row.emoji);
      mineByAnnouncement.set(row.announcementId, set);
    }

    // Auteurs (capés par emoji), dédupliqués par utilisateur pour ne présigner qu'une fois.
    const reactorsByKey = new Map<string, MinimalAthlete[]>();
    const distinct = new Map<string, MinimalAthlete>();
    for (const row of reactorRows) {
      const key = `${row.announcementId}:${row.emoji}`;
      const list = reactorsByKey.get(key) ?? [];
      if (list.length < cap) {
        list.push(row.user);
        reactorsByKey.set(key, list);
        distinct.set(row.user.id, row.user);
      }
    }
    const presented = new Map(
      (await this.teammates.presentMany([...distinct.values()])).map((t) => [t.id, t]),
    );

    for (const id of announcementIds) {
      const countMap = countByAnnouncement.get(id);
      const mineSet = mineByAnnouncement.get(id);
      views.set(id, {
        // Ordre canonique du jeu borné → affichage stable, on n'expose que les emoji présents.
        reactions: ANNOUNCEMENT_REACTION_EMOJIS.filter((e) => (countMap?.get(e) ?? 0) > 0).map(
          (emoji) => ({
            emoji,
            count: countMap!.get(emoji)!,
            reactors: (reactorsByKey.get(`${id}:${emoji}`) ?? []).map((u) => presented.get(u.id)!),
          }),
        ),
        myReactions: ANNOUNCEMENT_REACTION_EMOJIS.filter((e) => mineSet?.has(e)),
      });
    }
    return views;
  }

  /** Compteurs de lecture par annonce (anti N+1) — entiers seuls, jamais la liste des lecteurs. */
  private async readCounts(announcementIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (announcementIds.length === 0) return counts;
    const grouped = await this.prisma.announcementRead.groupBy({
      by: ['announcementId'],
      where: { announcementId: { in: announcementIds } },
      _count: { userId: true },
    });
    for (const row of grouped) counts.set(row.announcementId, row._count.userId);
    return counts;
  }

  /** Nombre de membres actifs du groupe (dénominateur de l'accusé de lecture). */
  private activeMemberCount(groupId: string): Promise<number> {
    return this.prisma.groupMember.count({ where: { groupId, leftAt: null } });
  }

  /** Membre actif requis (404 anti-énumération sinon) — le coach n'est pas un lecteur comptabilisé. */
  private async assertActiveMember(athleteId: string, groupId: string): Promise<void> {
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, athleteId, leftAt: null, group: { deletedAt: null } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Groupe introuvable.');
  }

  /** Ownership coach (inline, comme `GroupsService`) : 404 si groupe absent, 403 si pas le sien. */
  private async assertGroupOwnedByCoach(coachId: string, groupId: string): Promise<void> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { coachId: true },
    });
    if (!group) throw new NotFoundException('Groupe introuvable.');
    if (group.coachId !== coachId)
      throw new ForbiddenException('Ce groupe ne vous appartient pas.');
  }

  /** Lecture autorisée : coach propriétaire OU athlète membre actif (404 anti-énumération sinon). */
  private async assertCanRead(user: AuthenticatedUser, groupId: string): Promise<void> {
    if (user.role === 'coach') {
      const group = await this.prisma.group.findFirst({
        where: { id: groupId, deletedAt: null, coachId: user.id },
        select: { id: true },
      });
      if (!group) throw new NotFoundException('Groupe introuvable.');
      return;
    }
    const membership = await this.prisma.groupMember.findFirst({
      where: { groupId, athleteId: user.id, leftAt: null, group: { deletedAt: null } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('Groupe introuvable.');
  }
}

/** Réactions vides — annonce fraîchement créée ou sans aucune réaction. */
function emptyReactions(): ReactionView {
  return { reactions: [], myReactions: [] };
}

function toAnnouncementDto(
  row: AnnouncementWithAuthor,
  meta: AnnouncementMeta,
): GroupAnnouncementDto {
  return {
    id: row.id,
    groupId: row.groupId,
    body: row.body,
    author: {
      id: row.author.id,
      firstName: row.author.firstName ?? undefined,
      lastName: row.author.lastName ?? undefined,
      sport: row.author.sport ?? undefined,
    },
    createdAt: row.createdAt.toISOString(),
    reactions: meta.reactions,
    myReactions: meta.myReactions,
    readCount: meta.readCount,
    memberCount: meta.memberCount,
  };
}
