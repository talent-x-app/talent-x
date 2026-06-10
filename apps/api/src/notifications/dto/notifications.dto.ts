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

  @ApiPropertyOptional({ description: 'Vie du groupe (défaut true).' })
  @IsOptional()
  @IsBoolean()
  groupUpdates?: boolean;

  @ApiPropertyOptional({ description: 'Communications marketing (opt-in, défaut false).' })
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;
}
