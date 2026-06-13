import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { type AvatarUploadTargetDto } from './dto/avatar.dto';
import { type UserDto } from './dto/user.dto';
import {
  AVATAR_ALLOWED_CONTENT_TYPES,
  avatarObjectKey,
  isOwnedAvatarKey,
  toUserDtoWithAvatar,
} from './user-avatar';

const DEFAULT_UPLOAD_TTL_SECONDS = 300; // 5 min pour téléverser
const DEFAULT_READ_TTL_SECONDS = 3600; // 1 h pour afficher
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 Mo

/**
 * Photo de profil (TLX-124, spec §3.1). Upload **présigné** : le serveur ne touche
 * jamais les octets de l'image.
 *
 *  1. `POST /users/me/avatar` → URL présignée (PUT) + clé objet (namespace par titulaire) ;
 *  2. le client téléverse directement au stockage S3 ;
 *  3. `PUT /users/me/avatar` (clé objet) → le serveur **valide** l'objet déposé (présence,
 *     taille/format bornés via `headObject`) puis l'adopte comme avatar (remplace l'ancien) ;
 *  4. `DELETE /users/me/avatar` → supprime l'objet et efface `photo_url`.
 *
 * On ne stocke que la **clé objet** (donnée d'identité à accès limité, §3) ; la lecture du
 * profil expose une URL présignée temporaire (`toUserDtoWithAvatar`).
 */
@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly config: ConfigService,
  ) {}

  /** Génère une cible d'upload présignée (PUT) liée au `contentType` (422 si format non géré). */
  async createUpload(userId: string, contentType: string): Promise<AvatarUploadTargetDto> {
    this.assertAllowedContentType(contentType);
    const objectKey = avatarObjectKey(userId, randomUUID());
    const ttl =
      this.config.get<number>('AVATAR_UPLOAD_URL_TTL_SECONDS') ?? DEFAULT_UPLOAD_TTL_SECONDS;
    const uploadUrl = await this.storage.getPresignedUploadUrl(objectKey, contentType, ttl);
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    return { uploadUrl, objectKey, expiresAt };
  }

  /**
   * Adopte l'objet téléversé comme avatar : cloisonnement (403 hors namespace), présence et
   * bornes taille/format (422), remplacement de l'ancien avatar (suppression best-effort).
   */
  async confirm(userId: string, objectKey: string): Promise<UserDto> {
    const user = await this.requireActive(userId);
    if (!isOwnedAvatarKey(objectKey, userId)) {
      throw new ForbiddenException("Cette clé d'objet ne vous appartient pas.");
    }

    const head = await this.storage.headObject(objectKey);
    if (!head) {
      throw new UnprocessableEntityException({
        error: 'AVATAR_NOT_UPLOADED',
        message: "Aucun objet téléversé pour cette clé : terminez l'upload avant de confirmer.",
      });
    }
    const maxBytes = this.config.get<number>('AVATAR_MAX_BYTES') ?? DEFAULT_MAX_BYTES;
    if (head.contentLength > maxBytes) {
      await this.safeDelete(objectKey);
      throw new UnprocessableEntityException({
        error: 'AVATAR_TOO_LARGE',
        message: `L'image dépasse la taille maximale (${maxBytes} octets).`,
      });
    }
    if (head.contentType && !this.isAllowedContentType(head.contentType)) {
      await this.safeDelete(objectKey);
      throw new UnprocessableEntityException({
        error: 'INVALID_CONTENT_TYPE',
        message: 'Format d’image non géré (JPEG, PNG ou WebP attendu).',
      });
    }

    const previous = user.photoUrl;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { photoUrl: objectKey },
    });
    // Remplacement : l'ancien avatar n'est plus référencé → on libère le stockage.
    if (previous && previous !== objectKey && previous.startsWith('avatars/')) {
      await this.safeDelete(previous);
    }
    return this.present(updated);
  }

  /** Supprime l'avatar (objet + `photo_url`). Idempotent : no-op si aucun avatar. */
  async remove(userId: string): Promise<void> {
    const user = await this.requireActive(userId);
    if (!user.photoUrl) return;
    await this.safeDelete(user.photoUrl);
    await this.prisma.user.update({ where: { id: userId }, data: { photoUrl: null } });
  }

  private present(user: User): Promise<UserDto> {
    const ttl = this.config.get<number>('AVATAR_URL_TTL_SECONDS') ?? DEFAULT_READ_TTL_SECONDS;
    return toUserDtoWithAvatar(user, this.storage, ttl);
  }

  private assertAllowedContentType(contentType: string): void {
    if (!this.isAllowedContentType(contentType)) {
      throw new UnprocessableEntityException({
        error: 'INVALID_CONTENT_TYPE',
        message: 'Format d’image non géré (JPEG, PNG ou WebP attendu).',
      });
    }
  }

  private isAllowedContentType(contentType: string): boolean {
    return (AVATAR_ALLOWED_CONTENT_TYPES as readonly string[]).includes(contentType);
  }

  /** Suppression best-effort : un échec de nettoyage ne doit pas faire échouer l'opération. */
  private async safeDelete(key: string): Promise<void> {
    try {
      await this.storage.deleteObject(key);
    } catch (error) {
      this.logger.warn(`Échec de suppression de l'objet avatar ${key} : ${String(error)}`);
    }
  }

  private async requireActive(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    return user;
  }
}
