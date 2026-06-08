import { ConflictException, Injectable, NotImplementedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { type Role } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { type AuthSessionDto } from './dto/auth-session.dto';
import { type AuthTokensDto } from './dto/auth-tokens.dto';
import { type ForgotPasswordRequestDto } from './dto/forgot-password-request.dto';
import { type LoginRequestDto } from './dto/login-request.dto';
import { type LogoutRequestDto } from './dto/logout-request.dto';
import { type RefreshRequestDto } from './dto/refresh-request.dto';
import { type RegisterRequestDto } from './dto/register-request.dto';
import { type ResetPasswordRequestDto } from './dto/reset-password-request.dto';
import { type TwoFactorSetupDto } from './dto/two-factor-setup.dto';
import { type TwoFactorVerifyDto } from './dto/two-factor-verify.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { toUserDto } from './user.mapper';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Inscription (TLX-021) : crée le compte (mot de passe haché Argon2id) et ouvre
   * une session (access + refresh). Email unique insensible à la casse sur les
   * comptes actifs ; conflit normalisé en 409 EMAIL_ALREADY_USED.
   */
  async register(dto: RegisterRequestDto): Promise<AuthSessionDto> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' }, deletedAt: null },
      select: { id: true },
    });
    if (existing) this.throwEmailConflict();

    const passwordHash = await this.password.hash(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: dto.role,
          firstName: dto.firstName ?? '',
          lastName: dto.lastName ?? '',
        },
      });
      const tokens = await this.tokens.issueSession({ id: user.id, role: user.role as Role });
      return { ...tokens, user: toUserDto(user) };
    } catch (error) {
      // Course possible avec l'index unique partiel (lower(email)) hors datamodel.
      if (this.isEmailUniqueViolation(error)) this.throwEmailConflict();
      throw error;
    }
  }

  private throwEmailConflict(): never {
    throw new ConflictException({
      error: 'EMAIL_ALREADY_USED',
      message: 'Cet email est déjà utilisé.',
    });
  }

  private isEmailUniqueViolation(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return error.code === 'P2002';
    }
    const message = error instanceof Error ? error.message : '';
    return message.includes('ux_users_email') || message.includes('23505');
  }

  // --- Reste du domaine Auth : livré par les tickets dédiés (TLX-022+). ---

  private notImplemented(feature: string): never {
    throw new NotImplementedException(`${feature} — à implémenter (ticket Auth).`);
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
