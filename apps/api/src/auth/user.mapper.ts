import { type User } from '@prisma/client';
import { type Role } from '../common/decorators/roles.decorator';
import { type UserDto } from '../users/dto/user.dto';

/** Projette une entité User Prisma vers le DTO public `User` du contrat OpenAPI. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role as Role,
    firstName: user.firstName,
    lastName: user.lastName,
    // L'avatar (clé objet, TLX-124) n'est exposé que présigné via GET /users/me ;
    // la réponse d'auth ne porte pas la clé brute (inutilisable côté client).
    photoUrl: undefined,
    sport: user.sport ?? undefined,
    bio: user.bio ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
