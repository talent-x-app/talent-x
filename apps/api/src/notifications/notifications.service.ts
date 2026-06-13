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
    return {
      data: rows.map(toNotificationDto),
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

function toNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    type: notification.type as NotificationTypeValue,
    resourceId: notification.resourceId,
    readAt: notification.readAt?.toISOString(),
    createdAt: notification.createdAt.toISOString(),
  };
}

function toDeviceTokenDto(device: DeviceToken): DeviceTokenDto {
  return {
    id: device.id,
    platform: device.platform as DevicePlatform,
    token: device.token,
    createdAt: device.createdAt.toISOString(),
  };
}
