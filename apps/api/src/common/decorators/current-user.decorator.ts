import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Role } from './roles.decorator';

/** Utilisateur authentifié attaché à la requête par le JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

/**
 * Injecte l'utilisateur courant (ou l'un de ses champs) dans un handler.
 * Ex. `@CurrentUser() user: AuthenticatedUser` ou `@CurrentUser('id') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    return data && user ? user[data] : user;
  },
);
