import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { type UserDto } from './dto/user.dto';
import { type UserUpdateDto } from './dto/user-update.dto';
import { toUserDtoWithAvatar } from './user-avatar';

const DEFAULT_AVATAR_READ_TTL_SECONDS = 3600;

/**
 * Profil utilisateur courant (TLX-040) — `GET/PUT /users/me`.
 *
 * Le contrat OpenAPI modélise le profil sur `/users/me` (self), pas sur
 * `/athletes/{id}` : tout titulaire (coach comme athlète) lit et édite son propre
 * profil. L'accès coach→athlète passe par `/athletes/{id}/stats` (consent-gated),
 * hors de ce service. L'avatar (TLX-124) est exposé en `photoUrl` présigné ; son
 * upload/suppression passent par `AvatarService` (endpoints dédiés).
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly config: ConfigService,
  ) {}

  /** Profil du titulaire authentifié. 404 si le compte est supprimé/introuvable. */
  async getMe(userId: string): Promise<UserDto> {
    return this.present(await this.requireActive(userId));
  }

  /**
   * Met à jour le profil : seuls les champs fournis sont écrits (PATCH sémantique).
   * `email`/`role` ne sont pas modifiables ici. 404 si le compte est supprimé.
   */
  async updateMe(userId: string, dto: UserUpdateDto): Promise<UserDto> {
    await this.requireActive(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: definedOnly(dto),
    });
    return this.present(updated);
  }

  private present(user: User): Promise<UserDto> {
    const ttl =
      this.config.get<number>('AVATAR_URL_TTL_SECONDS') ?? DEFAULT_AVATAR_READ_TTL_SECONDS;
    return toUserDtoWithAvatar(user, this.storage, ttl);
  }

  /** Charge le titulaire ; rejette un compte inexistant ou soft-deleted. */
  private async requireActive(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    return user;
  }
}

/** Ne conserve que les clés explicitement fournies (ignore les `undefined`). */
function definedOnly(dto: UserUpdateDto): Partial<UserUpdateDto> {
  return Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
}
