import { type User } from '@prisma/client';
import { type Role } from '../common/decorators/roles.decorator';
import { type ObjectStorageService } from '../storage/object-storage.service';
import { type UserDto } from './dto/user.dto';

/**
 * Avatar de profil (TLX-124, spec §3.1). La photo est une **donnée d'identité à accès
 * limité** (§3) : on ne stocke que la **clé objet** S3 dans `users.photo_url` (jamais une
 * URL publique), et on expose une **URL présignée temporaire** à la lecture du profil.
 */
export const AVATAR_ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Préfixe de namespace des objets avatar — `avatars/<userId>/<uuid>` (cloisonnement). */
export const AVATAR_KEY_PREFIX = 'avatars/';

/** Clé objet d'un avatar pour un utilisateur (namespace par titulaire). */
export function avatarObjectKey(userId: string, uuid: string): string {
  return `${AVATAR_KEY_PREFIX}${userId}/${uuid}`;
}

/** Vrai si la clé appartient au namespace avatar du titulaire (cloisonnement). */
export function isOwnedAvatarKey(key: string, userId: string): boolean {
  return key.startsWith(`${AVATAR_KEY_PREFIX}${userId}/`);
}

/** Projette une ligne `users` Prisma vers le DTO public (photoUrl = clé brute stockée). */
export function toUserDtoRaw(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role as Role,
    firstName: user.firstName,
    lastName: user.lastName,
    photoUrl: user.photoUrl ?? undefined,
    sport: user.sport ?? undefined,
    bio: user.bio ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/**
 * DTO public avec `photoUrl` **présigné** (URL GET temporaire) si un avatar est stocké.
 * Défensif : si la présignature échoue (stockage non configuré en dev/test), `photoUrl`
 * est omis — le profil reste lisible et le client retombe sur les initiales.
 */
export async function toUserDtoWithAvatar(
  user: User,
  storage: ObjectStorageService,
  ttlSeconds: number,
): Promise<UserDto> {
  const dto = toUserDtoRaw(user);
  if (user.photoUrl) {
    try {
      dto.photoUrl = await storage.getPresignedDownloadUrl(user.photoUrl, ttlSeconds);
    } catch {
      dto.photoUrl = undefined;
    }
  }
  return dto;
}
