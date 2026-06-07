import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ROLES_KEY, type Role } from '../decorators/roles.decorator';

/**
 * Garde RBAC : vérifie que l'utilisateur courant possède l'un des rôles requis
 * par @Roles. Suppose un utilisateur déjà attaché à la requête par JwtAuthGuard,
 * et s'exécute donc après lui.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('Rôle insuffisant pour cette ressource.');
    }
    return true;
  }
}
