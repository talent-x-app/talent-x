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
    photoUrl: user.photoUrl ?? undefined,
    sport: user.sport ?? undefined,
    bio: user.bio ?? undefined,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
