import { SetMetadata } from '@nestjs/common';

/** Rôles applicatifs (schéma `Role` du contrat OpenAPI). */
export type Role = 'coach' | 'athlete';

export const ROLES_KEY = 'roles';

/**
 * Restreint l'accès d'une route à certains rôles (RBAC), appliqué par RolesGuard.
 * Ex. `@Roles('coach')` pour la création de séance.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
