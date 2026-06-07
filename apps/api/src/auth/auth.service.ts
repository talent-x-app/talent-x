import { Injectable, NotImplementedException } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthSessionDto } from './dto/auth-session.dto';
import type { AuthTokensDto } from './dto/auth-tokens.dto';
import type { ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import type { LoginRequestDto } from './dto/login-request.dto';
import type { LogoutRequestDto } from './dto/logout-request.dto';
import type { RefreshRequestDto } from './dto/refresh-request.dto';
import type { RegisterRequestDto } from './dto/register-request.dto';
import type { ResetPasswordRequestDto } from './dto/reset-password-request.dto';
import type { TwoFactorSetupDto } from './dto/two-factor-setup.dto';
import type { TwoFactorVerifyDto } from './dto/two-factor-verify.dto';

/**
 * Service d'authentification — SQUELETTE (TLX-011).
 *
 * La signature et le câblage (contrôleur ↔ service ↔ DTO ↔ Prisma) sont posés
 * comme patron de référence. La logique réelle (hash Argon2, JWT RS256, refresh
 * rotatif + détection de réutilisation, 2FA, anti-énumération) est livrée par le
 * ticket Auth dédié ; chaque méthode signale explicitement le non-implémenté.
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private notImplemented(feature: string): never {
    throw new NotImplementedException(`${feature} — à implémenter (ticket Auth).`);
  }

  register(_dto: RegisterRequestDto): Promise<AuthSessionDto> {
    return this.notImplemented('register');
  }

  login(_dto: LoginRequestDto): Promise<AuthSessionDto> {
    return this.notImplemented('login');
  }

  refresh(_dto: RefreshRequestDto): Promise<AuthTokensDto> {
    return this.notImplemented('refresh');
  }

  logout(_dto: LogoutRequestDto, _user: AuthenticatedUser): Promise<void> {
    return this.notImplemented('logout');
  }

  logoutAll(_user: AuthenticatedUser): Promise<void> {
    return this.notImplemented('logoutAll');
  }

  forgotPassword(_dto: ForgotPasswordRequestDto): Promise<void> {
    return this.notImplemented('forgotPassword');
  }

  resetPassword(_dto: ResetPasswordRequestDto): Promise<void> {
    return this.notImplemented('resetPassword');
  }

  enable2fa(_user: AuthenticatedUser): Promise<TwoFactorSetupDto> {
    return this.notImplemented('enable2fa');
  }

  verify2fa(_dto: TwoFactorVerifyDto, _user: AuthenticatedUser): Promise<void> {
    return this.notImplemented('verify2fa');
  }
}
