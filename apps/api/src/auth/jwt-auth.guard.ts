import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { TokenService } from './token.service';

interface AuthRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
}

/**
 * Garde d'authentification (TLX-022). Laisse passer les routes @Public ; sinon
 * exige un access token Bearer valide (RS256, vérifié par le keystore), et
 * attache l'utilisateur courant à la requête. Enregistrée globalement (APP_GUARD).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = this.extractBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({ error: 'UNAUTHORIZED', message: 'Jeton manquant.' });
    }

    try {
      const subject = this.tokens.verifyAccessToken(token);
      request.user = { id: subject.id, role: subject.role };
      return true;
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_TOKEN',
        message: 'Jeton invalide ou expiré.',
      });
    }
  }

  private extractBearer(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return null;
    const [scheme, token] = value.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
