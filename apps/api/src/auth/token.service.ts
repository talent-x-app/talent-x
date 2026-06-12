import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { type Role } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TOKEN_TTL_SECONDS, JWT_ISSUER, REFRESH_TOKEN_TTL_SECONDS } from './auth.constants';
import { type AuthTokensDto } from './dto/auth-tokens.dto';
import { KeyService } from './keys/key.service';

export interface TokenSubject {
  id: string;
  role: Role;
}

/** Empreinte stockée d'un refresh token opaque (jamais le jeton en clair). */
export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Empreinte stockée d'un jeton de réinitialisation de mot de passe (TLX-104).
 * Seul le hash est persisté ; le jeton en clair ne vit que dans l'email.
 */
export function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Émission des jetons (TLX-021+). Access token JWT RS256 signé par le keystore
 * (TLX-020) ; refresh token **opaque** rotatif, persisté sous forme hachée avec
 * un identifiant de famille (base de la détection de réutilisation — TLX-023).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly keys: KeyService,
    private readonly prisma: PrismaService,
  ) {}

  /** Signe un access token court. Le `kid` permet la rotation des clés. */
  issueAccessToken(subject: TokenSubject): { token: string; expiresIn: number } {
    const signing = this.keys.getSigningKey();
    const privateKeyPem = signing.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = jwt.sign({ role: subject.role }, privateKeyPem, {
      algorithm: this.keys.algorithm,
      subject: subject.id,
      issuer: JWT_ISSUER,
      keyid: signing.kid,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
    return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
  }

  /**
   * Vérifie un access token : résout la clé publique par `kid` (rotation),
   * contrôle la signature RS256, l'émetteur et l'expiration. Lève sur tout
   * problème (le guard mappe en 401). Retourne le sujet et le rôle.
   */
  verifyAccessToken(token: string): TokenSubject {
    const decoded = jwt.decode(token, { complete: true });
    const kid = typeof decoded === 'object' && decoded !== null ? decoded.header.kid : undefined;
    const publicKey = kid ? this.keys.getVerificationKey(kid) : undefined;
    if (!publicKey) {
      throw new Error('Clé de vérification introuvable pour ce token (kid).');
    }
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const payload = jwt.verify(token, publicKeyPem, {
      algorithms: [this.keys.algorithm],
      issuer: JWT_ISSUER,
    }) as jwt.JwtPayload;

    if (!payload.sub || (payload.role !== 'coach' && payload.role !== 'athlete')) {
      throw new Error('Claims du token invalides.');
    }
    return { id: payload.sub, role: payload.role };
  }

  /**
   * Crée et persiste un refresh token opaque. `familyId` permet de chaîner les
   * rotations successives (toute la famille est révoquée en cas de réutilisation).
   * Retourne le jeton **en clair** (la seule fois où il est exposé).
   */
  async issueRefreshToken(userId: string, familyId: string = randomUUID()): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(raw),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return raw;
  }

  /** Émet un couple access + refresh (nouvelle famille) pour une session fraîche. */
  async issueSession(subject: TokenSubject): Promise<AuthTokensDto> {
    const access = this.issueAccessToken(subject);
    const refreshToken = await this.issueRefreshToken(subject.id);
    return {
      accessToken: access.token,
      refreshToken,
      expiresIn: access.expiresIn,
    };
  }
}
