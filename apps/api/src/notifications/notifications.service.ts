import { Injectable, NotFoundException } from '@nestjs/common';
import type { DeviceToken, Notification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPageMeta } from '../common/pagination/page-meta';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import {
  DeviceTokenCreateDto,
  DeviceTokenDto,
  NotificationDto,
  NotificationPageDto,
  NotificationPreferencesDto,
  ReadAllResultDto,
  type DevicePlatform,
  type NotificationTypeValue,
} from './dto/notifications.dto';

/** Défauts de préférences (ADR-22) : tout actif sauf marketing (opt-in RGPD). */
const PREFERENCE_DEFAULTS: Required<NotificationPreferencesDto> = {
  sessionAssigned: true,
  performanceFeedback: true,
  performanceSubmitted: true,
  groupUpdates: true,
  marketing: false,
};

/**
 * Device tokens & préférences de notification (TLX-110, ADR-22).
 *  - Token : upsert par `token` (unique en base) — ré-enregistrer un appareil le
 *    ré-associe au compte courant, rafraîchit `last_seen_at` et lève la révocation
 *    (cycle de vie TX-ARCH-001 §4.6). Révocation logique, ownership (404 si étranger).
 *  - Préférences : absence de ligne = défauts ; `PUT` upsert en ne touchant que les
 *    champs fournis.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Feed in-app (ADR-23) : page triée récentes d'abord + compteur de non-lues (badge). */
  async listNotifications(userId: string, q: PaginationQueryDto): Promise<NotificationPageDto> {
    const where = { userId };
    const [rows, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    // Résolution nominative (ADR-55) : on résout les acteurs de la page en **un** lot, en prénom
    // (minimisé). Le destinataire est déjà autorisé à connaître ce nom (lien coach↔athlète /
    // co-appartenance). Aucun nom n'est stocké : seul l'`actorId` l'est, résolu ici à la lecture.
    const actorIds = [
      ...new Set(rows.map((r) => r.actorId).filter((id): id is string => id != null)),
    ];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const actorNames = buildActorNames(actors);

    return {
      data: rows.map((r) =>
        toNotificationDto(r, r.actorId ? actorNames.get(r.actorId) : undefined),
      ),
      meta: buildPageMeta(total, q.page, q.limit),
      unreadCount,
    };
  }

  /** Marque tout lu (appelé à l'ouverture du centre de notifications). */
  async readAll(userId: string): Promise<ReadAllResultDto> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async registerDevice(userId: string, dto: DeviceTokenCreateDto): Promise<DeviceTokenDto> {
    const now = new Date();
    const device = await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform, lastSeenAt: now },
      update: { userId, platform: dto.platform, lastSeenAt: now, revokedAt: null },
    });
    return toDeviceTokenDto(device);
  }

  async revokeDevice(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.deviceToken.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new NotFoundException('Appareil introuvable.');
    }
  }

  async getPreferences(userId: string): Promise<Required<NotificationPreferencesDto>> {
    const row = await this.prisma.notificationPreferences.findUnique({ where: { userId } });
    if (!row) {
      return { ...PREFERENCE_DEFAULTS };
    }
    return {
      sessionAssigned: row.sessionAssigned,
      performanceFeedback: row.performanceFeedback,
      performanceSubmitted: row.performanceSubmitted,
      groupUpdates: row.groupUpdates,
      marketing: row.marketing,
    };
  }

  async updatePreferences(
    userId: string,
    dto: NotificationPreferencesDto,
  ): Promise<Required<NotificationPreferencesDto>> {
    // Seuls les champs fournis sont écrits ; en création, les absents prennent les défauts.
    const provided = {
      ...(dto.sessionAssigned !== undefined && { sessionAssigned: dto.sessionAssigned }),
      ...(dto.performanceFeedback !== undefined && {
        performanceFeedback: dto.performanceFeedback,
      }),
      ...(dto.performanceSubmitted !== undefined && {
        performanceSubmitted: dto.performanceSubmitted,
      }),
      ...(dto.groupUpdates !== undefined && { groupUpdates: dto.groupUpdates }),
      ...(dto.marketing !== undefined && { marketing: dto.marketing }),
    };
    const row = await this.prisma.notificationPreferences.upsert({
      where: { userId },
      create: { userId, ...provided },
      update: provided,
    });
    return {
      sessionAssigned: row.sessionAssigned,
      performanceFeedback: row.performanceFeedback,
      performanceSubmitted: row.performanceSubmitted,
      groupUpdates: row.groupUpdates,
      marketing: row.marketing,
    };
  }
}

function toNotificationDto(notification: Notification, actorName?: string): NotificationDto {
  return {
    id: notification.id,
    type: notification.type as NotificationTypeValue,
    resourceId: notification.resourceId,
    // Acteur résolu (ADR-55) : présent seulement si on a pu résoudre un prénom (sinon repli client).
    ...(notification.actorId && actorName
      ? { actor: { id: notification.actorId, displayName: actorName } }
      : {}),
    readAt: notification.readAt?.toISOString(),
    createdAt: notification.createdAt.toISOString(),
  };
}

/**
 * Prénoms d'affichage (ADR-55), minimisés : prénom seul, désambiguïsé en « Prénom N. » en cas
 * d'homonymie **dans la page**. Repli sur le nom puis « Quelqu'un » si le prénom manque.
 */
function buildActorNames(
  users: { id: string; firstName: string | null; lastName: string | null }[],
): Map<string, string> {
  const firstNameCounts = new Map<string, number>();
  for (const u of users) {
    const fn = u.firstName?.trim();
    if (fn) firstNameCounts.set(fn, (firstNameCounts.get(fn) ?? 0) + 1);
  }
  const names = new Map<string, string>();
  for (const u of users) {
    const fn = u.firstName?.trim();
    const ln = u.lastName?.trim();
    if (!fn) {
      names.set(u.id, ln || 'Quelqu’un');
      continue;
    }
    const ambiguous = (firstNameCounts.get(fn) ?? 0) > 1 && !!ln;
    names.set(u.id, ambiguous ? `${fn} ${ln![0].toUpperCase()}.` : fn);
  }
  return names;
}

function toDeviceTokenDto(device: DeviceToken): DeviceTokenDto {
  return {
    id: device.id,
    platform: device.platform as DevicePlatform,
    token: device.token,
    createdAt: device.createdAt.toISOString(),
  };
}
