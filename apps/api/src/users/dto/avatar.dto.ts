import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { AVATAR_ALLOWED_CONTENT_TYPES } from '../user-avatar';

/**
 * Corps de `POST /users/me/avatar` — demande une URL d'upload présignée (TLX-124).
 * Le format géré est validé **côté service** (422 `INVALID_CONTENT_TYPE`), même code
 * que la vérification du type réel de l'objet à la confirmation.
 */
export class AvatarUploadRequestDto {
  @ApiProperty({
    enum: AVATAR_ALLOWED_CONTENT_TYPES,
    description: "Type MIME de l'image à téléverser (JPEG/PNG/WebP).",
  })
  @IsString()
  @MaxLength(100)
  contentType!: string;
}

/** Cible d'upload présignée renvoyée par `POST /users/me/avatar` — schéma `AvatarUploadTarget`. */
export class AvatarUploadTargetDto {
  @ApiProperty({ format: 'uri', description: 'URL présignée (PUT) où téléverser les octets.' })
  uploadUrl!: string;

  @ApiProperty({ description: "Clé objet à confirmer après l'upload." })
  objectKey!: string;

  @ApiProperty({ format: 'date-time', description: "Expiration de l'URL d'upload." })
  expiresAt!: string;
}

/** Corps de `PUT /users/me/avatar` — adopte l'objet téléversé comme avatar. */
export class AvatarConfirmRequestDto {
  @ApiProperty({ description: 'Clé objet renvoyée par la demande d’upload.' })
  @IsString()
  @MaxLength(512)
  objectKey!: string;
}
