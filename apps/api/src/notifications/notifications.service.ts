import { Injectable, NotFoundException } from '@nestjs/common';
import type { DeviceToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DeviceTokenCreateDto,
  DeviceTokenDto,
  NotificationPreferencesDto,
  type DevicePlatform,
} from './dto/notifications.dto';

/** Défauts de préférences (ADR-22) : tout actif sauf marketing (opt-in RGPD). */
const PREFERENCE_DEFAULTS: Required<NotificationPreferencesDto> = {
  sessionAssigned: true,
  performanceFeedback: true,
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
      groupUpdates: row.groupUpdates,
      marketing: row.marketing,
    };
  }
}

function toDeviceTokenDto(device: DeviceToken): DeviceTokenDto {
  return {
    id: device.id,
    platform: device.platform as DevicePlatform,
    token: device.token,
    createdAt: device.createdAt.toISOString(),
  };
}
