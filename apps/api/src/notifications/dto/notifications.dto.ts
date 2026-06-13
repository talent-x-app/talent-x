import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Plateformes push supportées — schéma `DevicePlatform`. */
export const DEVICE_PLATFORMS = ['apns', 'fcm'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Corps de `POST /notifications/devices` — schéma `DeviceTokenCreate`. */
export class DeviceTokenCreateDto {
  @ApiProperty({ enum: DEVICE_PLATFORMS })
  @IsIn(DEVICE_PLATFORMS)
  platform!: DevicePlatform;

  @ApiProperty({ description: "Jeton d'appareil délivré par APNs ou FCM." })
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/** Device enregistré — schéma `DeviceToken`. */
export class DeviceTokenDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DEVICE_PLATFORMS })
  platform!: DevicePlatform;

  @ApiProperty()
  token!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** Taxonomie ADR-22 — schéma `NotificationType`. */
export const NOTIFICATION_TYPES = [
  'session_assigned',
  'performance_feedback',
  'performance_submitted',
  'group_update',
] as const;
export type NotificationTypeValue = (typeof NOTIFICATION_TYPES)[number];

/** Notification in-app — schéma `Notification` (ADR-23). */
export class NotificationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NOTIFICATION_TYPES })
  type!: NotificationTypeValue;

  @ApiProperty({
    format: 'uuid',
    description: 'Ressource à ouvrir (affectation, performance ou groupe selon le type).',
  })
  resourceId!: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Absent tant que non lue.' })
  readAt?: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** Page de notifications + badge — schéma `NotificationPage`. */
export class NotificationPageDto {
  @ApiProperty({ type: [NotificationDto] })
  data!: NotificationDto[];

  @ApiProperty()
  meta!: { total: number; page: number; limit: number; hasNext: boolean };

  @ApiProperty({ description: 'Nombre total de notifications non lues (badge).' })
  unreadCount!: number;
}

/** Résultat de `POST /notifications/read-all` — schéma `ReadAllResult`. */
export class ReadAllResultDto {
  @ApiProperty({ description: 'Nombre de notifications passées à lues.' })
  updated!: number;
}

/**
 * Préférences de notification — schéma `NotificationPreferences` (ADR-22).
 * Toutes optionnelles au contrat : le `PUT` ne touche que les champs fournis,
 * le `GET` répond toujours les quatre drapeaux (défauts si aucune ligne).
 */
export class NotificationPreferencesDto {
  @ApiPropertyOptional({ description: 'Séance affectée (défaut true).' })
  @IsOptional()
  @IsBoolean()
  sessionAssigned?: boolean;

  @ApiPropertyOptional({ description: 'Feedback du coach sur une performance (défaut true).' })
  @IsOptional()
  @IsBoolean()
  performanceFeedback?: boolean;

  @ApiPropertyOptional({
    description: 'Performance soumise par un athlète, à revoir (coach — défaut true).',
  })
  @IsOptional()
  @IsBoolean()
  performanceSubmitted?: boolean;

  @ApiPropertyOptional({ description: 'Vie du groupe (défaut true).' })
  @IsOptional()
  @IsBoolean()
  groupUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Communications marketing (opt-in, défaut false).' })
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}
