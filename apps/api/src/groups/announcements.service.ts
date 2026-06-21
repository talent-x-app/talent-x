import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { GroupAnnouncement, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { NotificationQueueService } from '../jobs/notification-queue.service';
import {
  AnnouncementCreateDto,
  GroupAnnouncementDto,
  GroupAnnouncementListDto,
} from './dto/announcement.dto';

type AnnouncementWithAuthor = GroupAnnouncement & {
  author: Pick<User, 'id' | 'firstName' | 'lastName' | 'sport'>;
};

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
  ) {}

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
    return { data: rows.map(toAnnouncementDto) };
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
    return toAnnouncementDto(created);
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

function toAnnouncementDto(row: AnnouncementWithAuthor): GroupAnnouncementDto {
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
  };
}
