import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { type Role } from '../common/decorators/roles.decorator';
import { EmailQueueService } from '../jobs/email-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { PASSWORD_RESET_TOKEN_TTL_SECONDS } from './auth.constants';
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
import { hashRefreshToken, hashResetToken, TokenService } from './token.service';
import { toUserDto } from './user.mapper';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly emailQueue: EmailQueueService,
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

  /**
   * Connexion (TLX-022) : vérifie les identifiants et ouvre une session. Réponse
   * neutre (même 401 INVALID_CREDENTIALS si l'email est inconnu ou le mot de passe
   * faux) et temps de réponse égalisé (vérification contre un hash factice quand
   * l'utilisateur n'existe pas) pour limiter l'énumération de comptes.
   */
  async login(dto: LoginRequestDto): Promise<AuthSessionDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' }, deletedAt: null },
    });
    const passwordValid = await this.password.verify(
      user?.passwordHash ?? (await this.getDecoyHash()),
      dto.password,
    );
    if (!user || !passwordValid) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Identifiants invalides.',
      });
    }
    const tokens = await this.tokens.issueSession({ id: user.id, role: user.role as Role });
    return { ...tokens, user: toUserDto(user) };
  }

  /** Hash factice (calculé une fois) pour égaliser le temps de `login`. */
  private decoyHash?: Promise<string>;
  private getDecoyHash(): Promise<string> {
    this.decoyHash ??= this.password.hash(randomUUID());
    return this.decoyHash;
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

  /**
   * Renouvellement (TLX-023) : le refresh token est à usage unique et tourne à
   * chaque appel (nouveau jeton dans la même famille). La réutilisation d'un
   * jeton déjà consommé (vol présumé) révoque toute la famille et renvoie
   * 409 TOKEN_REUSE_DETECTED.
   */
  async refresh(dto: RefreshRequestDto): Promise<AuthTokensDto> {
    const tokenHash = hashRefreshToken(dto.refreshToken);
    const record = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (!record) {
      throw this.invalidRefreshToken();
    }

    // Jeton déjà consommé ou révoqué → réutilisation : on coupe toute la famille.
    if (record.used || record.revokedAt) {
      await this.revokeFamily(record.familyId);
      throw this.reuseDetected();
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw this.invalidRefreshToken();
    }

    // Consommation atomique : si une course a déjà marqué le jeton, count=0 → réutilisation.
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, used: false, revokedAt: null },
      data: { used: true },
    });
    if (consumed.count === 0) {
      await this.revokeFamily(record.familyId);
      throw this.reuseDetected();
    }

    const user = await this.prisma.user.findFirst({
      where: { id: record.userId, deletedAt: null },
      select: { id: true, role: true },
    });
    if (!user) {
      throw this.invalidRefreshToken();
    }

    const access = this.tokens.issueAccessToken({ id: user.id, role: user.role as Role });
    const refreshToken = await this.tokens.issueRefreshToken(user.id, record.familyId);
    return { accessToken: access.token, refreshToken, expiresIn: access.expiresIn };
  }

  private revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private invalidRefreshToken(): never {
    throw new UnauthorizedException({
      error: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token invalide ou expiré.',
    });
  }

  private reuseDetected(): never {
    throw new ConflictException({
      error: 'TOKEN_REUSE_DETECTED',
      message: 'Réutilisation de refresh token détectée ; sessions révoquées.',
    });
  }

  /**
   * Déconnexion (TLX-022, TX-SEC-003 §11) : révoque le refresh token courant
   * (confinement d'une session volée). Idempotent et neutre — toujours 204 :
   * un jeton absent, déjà révoqué, ou appartenant à un autre compte ne fait rien
   * et ne renseigne pas l'appelant (anti-énumération). Le `userId` borne la
   * révocation au titulaire authentifié.
   */
  async logout(dto: LogoutRequestDto, user: AuthenticatedUser): Promise<void> {
    if (!dto.refreshToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(dto.refreshToken), userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Déconnexion globale (TLX-022, TX-SEC-003 §11) : révoque toutes les sessions
   * actives du titulaire (toutes les familles de refresh tokens). Idempotent.
   */
  async logoutAll(user: AuthenticatedUser): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Mot de passe oublié (TLX-104, TX-SEC-003 §11) : déclenche l'envoi d'un lien de
   * réinitialisation. **Réponse neutre** — toujours 202, qu'un compte existe ou non
   * (anti-énumération) : on n'émet un jeton et un email que si l'email correspond à
   * un compte actif. Le jeton opaque est stocké haché (usage unique, expirant) ; le
   * jeton en clair ne voyage que dans la file email. L'enqueue est tolérant aux
   * pannes (jamais d'échec propagé) pour préserver la neutralité de la réponse.
   */
  async forgotPassword(dto: ForgotPasswordRequestDto): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' }, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) return; // Réponse neutre : aucun indice que le compte n'existe pas.

    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000),
      },
    });
    await this.emailQueue.enqueuePasswordReset(user.email, rawToken);
  }

  /**
   * Réinitialisation (TLX-104, TX-SEC-003 §11) : consomme un jeton à usage unique,
   * met à jour le hash Argon2id et **révoque toutes les sessions** du compte (un
   * reset coupe les accès existants). Le jeton est validé (existant, non consommé,
   * non expiré, compte actif) puis consommé de façon atomique (anti-rejeu / course).
   * Les autres jetons en attente du compte sont invalidés au passage.
   */
  async resetPassword(dto: ResetPasswordRequestDto): Promise<void> {
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash: hashResetToken(dto.token) },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw this.invalidResetToken();
    }
    const user = await this.prisma.user.findFirst({
      where: { id: record.userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw this.invalidResetToken();

    // Hash hors transaction (Argon2 est coûteux : ne pas tenir la transaction ouverte).
    const passwordHash = await this.password.hash(dto.newPassword);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      // Consommation atomique : si une course a déjà consommé le jeton, count=0 → invalide.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count === 0) throw this.invalidResetToken();

      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      // Un reset invalide toutes les sessions actives (refresh tokens).
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      // Invalide les autres jetons de reset en attente (un seul lien doit servir).
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
    });
  }

  private invalidResetToken(): never {
    throw new BadRequestException({
      error: 'INVALID_RESET_TOKEN',
      message: 'Jeton de réinitialisation invalide ou expiré.',
    });
  }

  enable2fa(_user: AuthenticatedUser): Promise<TwoFactorSetupDto> {
    return this.notImplemented('enable2fa');
  }

  verify2fa(_dto: TwoFactorVerifyDto, _user: AuthenticatedUser): Promise<void> {
    return this.notImplemented('verify2fa');
  }
}
