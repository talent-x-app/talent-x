import { CanActivate, ExecutionContext, Injectable, NotImplementedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Garde d'authentification JWT (RS256) — SQUELETTE (TLX-011).
 *
 * Laisse passer les routes marquées @Public. Pour les routes protégées, la
 * vérification réelle du jeton (RS256, expiration, attache de l'utilisateur à la
 * requête) sera implémentée dans le ticket Auth dédié ; tant que ce n'est pas le
 * cas, on signale explicitement le non-implémenté plutôt que d'autoriser à tort.
 *
 * Cette garde n'est PAS enregistrée globalement à ce stade : elle fournit le
 * patron à brancher (APP_GUARD) une fois la stratégie JWT livrée.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    throw new NotImplementedException('Authentification JWT non encore implémentée (ticket Auth).');
  }
}
