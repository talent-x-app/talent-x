import { Injectable, NotFoundException } from '@nestjs/common';
import { type User } from '@prisma/client';
import { type Role } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { type UserDto } from './dto/user.dto';
import { type UserUpdateDto } from './dto/user-update.dto';

/**
 * Profil utilisateur courant (TLX-040) — `GET/PUT /users/me`.
 *
 * Le contrat OpenAPI modélise le profil sur `/users/me` (self), pas sur
 * `/athletes/{id}` : tout titulaire (coach comme athlète) lit et édite son propre
 * profil. L'accès coach→athlète passe par `/athletes/{id}/stats` (consent-gated),
 * hors de ce service.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** Profil du titulaire authentifié. 404 si le compte est supprimé/introuvable. */
  async getMe(userId: string): Promise<UserDto> {
    return toUserDto(await this.requireActive(userId));
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
    return toUserDto(updated);
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

/** Projette une ligne `users` Prisma vers le DTO public `User`. */
function toUserDto(user: User): UserDto {
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
