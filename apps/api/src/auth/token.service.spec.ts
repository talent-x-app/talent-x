import jwt from 'jsonwebtoken';
import { type PrismaService } from '../prisma/prisma.service';
import { KeyService } from './keys/key.service';
import { TokenService, hashRefreshToken } from './token.service';

describe('TokenService', () => {
  let keys: KeyService;

  beforeAll(() => {
    // NODE_ENV=test → keystore RS256 éphémère généré en mémoire (TLX-020).
    keys = new KeyService();
    keys.onModuleInit();
  });

  it('émet un access token RS256 vérifiable (sub, role, kid)', () => {
    const prisma = { refreshToken: { create: jest.fn() } } as unknown as PrismaService;
    const service = new TokenService(keys, prisma);

    const { token, expiresIn } = service.issueAccessToken({ id: 'u1', role: 'coach' });
    expect(expiresIn).toBeGreaterThan(0);

    const publicPem = keys
      .getSigningKey()
      .publicKey.export({ type: 'spki', format: 'pem' })
      .toString();
    const decoded = jwt.verify(token, publicPem, { algorithms: ['RS256'] }) as jwt.JwtPayload;
    expect(decoded.sub).toBe('u1');
    expect(decoded.role).toBe('coach');

    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()) as {
      kid?: string;
    };
    expect(header.kid).toBe(keys.getActiveKid());
  });

  it('persiste un refresh token haché (jamais en clair) avec une famille', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { refreshToken: { create } } as unknown as PrismaService;
    const service = new TokenService(keys, prisma);

    const raw = await service.issueRefreshToken('u1');
    expect(typeof raw).toBe('string');
    expect(create).toHaveBeenCalledTimes(1);

    const { data } = create.mock.calls[0][0] as {
      data: { tokenHash: string; userId: string; familyId: string; expiresAt: Date };
    };
    expect(data.tokenHash).toBe(hashRefreshToken(raw));
    expect(data.tokenHash).not.toBe(raw);
    expect(data.userId).toBe('u1');
    expect(data.familyId).toEqual(expect.any(String));
    expect(data.expiresAt).toBeInstanceOf(Date);
  });
});
