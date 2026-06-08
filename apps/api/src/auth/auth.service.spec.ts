import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { type PasswordService } from './password.service';
import { type RegisterRequestDto } from './dto/register-request.dto';
import { type TokenService } from './token.service';

const dto: RegisterRequestDto = {
  email: 'New@Example.com',
  password: 'SecureP@ss123',
  role: 'coach',
  firstName: 'A',
  lastName: 'B',
};

const createdUser = {
  id: 'u1',
  email: dto.email,
  role: 'coach',
  firstName: 'A',
  lastName: 'B',
  photoUrl: null,
  sport: null,
  bio: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function make(userOverrides: Record<string, jest.Mock> = {}) {
  const user = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(createdUser),
    ...userOverrides,
  };
  const prisma = { user } as unknown as PrismaService;
  const password = {
    hash: jest.fn().mockResolvedValue('argon$hash'),
    verify: jest.fn().mockResolvedValue(true),
  } as unknown as PasswordService;
  const tokens = {
    issueSession: jest
      .fn()
      .mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }),
  } as unknown as TokenService;
  return { service: new AuthService(prisma, password, tokens), user, password, tokens };
}

describe('AuthService.register (TLX-021)', () => {
  it('crée le compte (mot de passe haché) et ouvre une session', async () => {
    const { service, user, password, tokens } = make();

    const result = await service.register(dto);

    expect(password.hash).toHaveBeenCalledWith(dto.password);
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: dto.email,
          passwordHash: 'argon$hash',
          role: 'coach',
        }),
      }),
    );
    expect(tokens.issueSession).toHaveBeenCalledWith({ id: 'u1', role: 'coach' });
    expect(result).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user: expect.objectContaining({ id: 'u1', email: dto.email, role: 'coach' }),
    });
  });

  it('409 si l’email est déjà utilisé (pré-check)', async () => {
    const { service, user } = make({ findFirst: jest.fn().mockResolvedValue({ id: 'x' }) });
    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(user.create).not.toHaveBeenCalled();
  });

  it('409 sur violation d’unicité à la création (course)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: '5.22.0',
    });
    const { service } = make({ create: jest.fn().mockRejectedValue(p2002) });
    await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('AuthService.login (TLX-022)', () => {
  const loginUser = { ...createdUser, passwordHash: 'argon$stored' };
  const creds = { email: dto.email, password: dto.password };

  it('ouvre une session quand les identifiants sont valides', async () => {
    const { service, password, tokens } = make({
      findFirst: jest.fn().mockResolvedValue(loginUser),
    });

    const result = await service.login(creds);

    expect(password.verify).toHaveBeenCalledWith('argon$stored', creds.password);
    expect(tokens.issueSession).toHaveBeenCalledWith({ id: 'u1', role: 'coach' });
    expect(result.accessToken).toBe('a');
    expect(result.user).toEqual(expect.objectContaining({ id: 'u1', email: dto.email }));
  });

  it('401 quand le mot de passe est faux', async () => {
    const { service, password } = make({ findFirst: jest.fn().mockResolvedValue(loginUser) });
    (password.verify as jest.Mock).mockResolvedValue(false);
    await expect(service.login(creds)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 (réponse neutre) quand l’email est inconnu', async () => {
    const { service, password } = make({ findFirst: jest.fn().mockResolvedValue(null) });
    await expect(service.login(creds)).rejects.toBeInstanceOf(UnauthorizedException);
    // timing égalisé : verify est tout de même appelé (contre un hash factice).
    expect(password.verify).toHaveBeenCalled();
  });
});

interface RefreshRecord {
  id: string;
  userId: string;
  familyId: string;
  used: boolean;
  revokedAt: Date | null;
  expiresAt: Date;
}

function makeRefresh(opts: { record?: RefreshRecord | null; updateCount?: number } = {}) {
  const record: RefreshRecord | null =
    opts.record === undefined
      ? {
          id: 'rt1',
          userId: 'u1',
          familyId: 'fam1',
          used: false,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 100_000),
        }
      : opts.record;
  const refreshToken = {
    findFirst: jest.fn().mockResolvedValue(record),
    updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
  };
  const prisma = {
    refreshToken,
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1', role: 'coach' }) },
  } as unknown as PrismaService;
  const password = {} as unknown as PasswordService;
  const tokens = {
    issueAccessToken: jest.fn().mockReturnValue({ token: 'newA', expiresIn: 900 }),
    issueRefreshToken: jest.fn().mockResolvedValue('newR'),
  } as unknown as TokenService;
  return { service: new AuthService(prisma, password, tokens), refreshToken, tokens };
}

describe('AuthService.refresh (TLX-023)', () => {
  it('rotation : émet de nouveaux jetons dans la même famille et consomme l’ancien', async () => {
    const { service, refreshToken, tokens } = makeRefresh();

    const result = await service.refresh({ refreshToken: 'opaque' });

    expect(result).toEqual({ accessToken: 'newA', refreshToken: 'newR', expiresIn: 900 });
    expect(refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'rt1', used: false }),
        data: { used: true },
      }),
    );
    expect(tokens.issueRefreshToken).toHaveBeenCalledWith('u1', 'fam1');
  });

  it('réutilisation d’un jeton consommé → 409 + révocation de la famille', async () => {
    const { service, refreshToken } = makeRefresh({
      record: {
        id: 'rt1',
        userId: 'u1',
        familyId: 'fam1',
        used: true,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100_000),
      },
    });

    await expect(service.refresh({ refreshToken: 'opaque' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'fam1' }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it('jeton inconnu → 401', async () => {
    const { service } = makeRefresh({ record: null });
    await expect(service.refresh({ refreshToken: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('jeton expiré → 401', async () => {
    const { service } = makeRefresh({
      record: {
        id: 'rt1',
        userId: 'u1',
        familyId: 'fam1',
        used: false,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(service.refresh({ refreshToken: 'x' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('course : consommation déjà faite (count=0) → 409', async () => {
    const { service } = makeRefresh({ updateCount: 0 });
    await expect(service.refresh({ refreshToken: 'x' })).rejects.toBeInstanceOf(ConflictException);
  });
});
