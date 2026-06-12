import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { type PasswordService } from './password.service';
import { type RegisterRequestDto } from './dto/register-request.dto';
import { hashRefreshToken, hashResetToken, type TokenService } from './token.service';
import { type EmailQueueService } from '../jobs/email-queue.service';

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
  const emailQueue = {
    enqueuePasswordReset: jest.fn().mockResolvedValue(undefined),
  } as unknown as EmailQueueService;
  return {
    service: new AuthService(prisma, password, tokens, emailQueue),
    user,
    password,
    tokens,
    emailQueue,
  };
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
  return {
    service: new AuthService(prisma, password, tokens, {} as unknown as EmailQueueService),
    refreshToken,
    tokens,
  };
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

function makeLogout() {
  const refreshToken = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const prisma = { refreshToken } as unknown as PrismaService;
  const service = new AuthService(
    prisma,
    {} as unknown as PasswordService,
    {} as unknown as TokenService,
    {} as unknown as EmailQueueService,
  );
  return { service, refreshToken };
}

const authedUser = { id: 'u1', role: 'coach' as const };

describe('AuthService.logout (TLX-022)', () => {
  it('révoque le refresh token courant, borné au titulaire', async () => {
    const { service, refreshToken } = makeLogout();

    await service.logout({ refreshToken: 'opaque' }, authedUser);

    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken('opaque'), userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('sans refresh token dans le corps → no-op (toujours 204)', async () => {
    const { service, refreshToken } = makeLogout();

    await expect(service.logout({}, authedUser)).resolves.toBeUndefined();
    expect(refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('AuthService.logoutAll (TLX-022)', () => {
  it('révoque toutes les sessions actives du titulaire', async () => {
    const { service, refreshToken } = makeLogout();

    await service.logoutAll(authedUser);

    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('AuthService.forgotPassword (TLX-104)', () => {
  function makeForgot(user: { id: string; email: string } | null) {
    const prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(user) },
      passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'prt1' }) },
    } as unknown as PrismaService;
    const emailQueue = {
      enqueuePasswordReset: jest.fn().mockResolvedValue(undefined),
    } as unknown as EmailQueueService;
    const service = new AuthService(
      prisma,
      { hash: jest.fn() } as unknown as PasswordService,
      {} as unknown as TokenService,
      emailQueue,
    );
    return { service, prisma, emailQueue };
  }

  it('compte actif : crée un jeton haché expirant et enfile l’email avec le jeton en clair', async () => {
    const { service, prisma, emailQueue } = makeForgot({ id: 'u1', email: 'a@e.test' });

    await service.forgotPassword({ email: 'A@e.test' });

    const createArg = (prisma.passwordResetToken.create as jest.Mock).mock.calls[0][0];
    expect(createArg.data.userId).toBe('u1');
    expect(createArg.data.tokenHash).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex, pas le jeton clair
    expect(createArg.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // Le jeton enfilé est le clair, et son hash == celui persisté (jamais l’inverse).
    const [, rawToken] = (emailQueue.enqueuePasswordReset as jest.Mock).mock.calls[0];
    expect(emailQueue.enqueuePasswordReset).toHaveBeenCalledWith('a@e.test', rawToken);
    expect(hashResetToken(rawToken)).toBe(createArg.data.tokenHash);
  });

  it('email inconnu : réponse neutre — aucun jeton, aucun email (anti-énumération)', async () => {
    const { service, prisma, emailQueue } = makeForgot(null);

    await expect(service.forgotPassword({ email: 'ghost@e.test' })).resolves.toBeUndefined();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(emailQueue.enqueuePasswordReset).not.toHaveBeenCalled();
  });
});

describe('AuthService.resetPassword (TLX-104)', () => {
  interface ResetRecord {
    id: string;
    userId: string;
    usedAt: Date | null;
    expiresAt: Date;
  }

  function makeReset(opts: {
    record?: ResetRecord | null;
    user?: { id: string } | null;
    consumedCount?: number;
  }) {
    const record =
      opts.record === undefined
        ? { id: 'prt1', userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() + 100_000) }
        : opts.record;
    const passwordResetToken = {
      findFirst: jest.fn().mockResolvedValue(record),
      updateMany: jest.fn().mockResolvedValue({ count: opts.consumedCount ?? 1 }),
    };
    const refreshToken = { updateMany: jest.fn().mockResolvedValue({ count: 2 }) };
    const user = {
      findFirst: jest.fn().mockResolvedValue(opts.user === undefined ? { id: 'u1' } : opts.user),
      update: jest.fn().mockResolvedValue({ id: 'u1' }),
    };
    const tx = { passwordResetToken, refreshToken, user };
    const prisma = {
      passwordResetToken,
      user,
      refreshToken,
      $transaction: jest.fn().mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const password = {
      hash: jest.fn().mockResolvedValue('argon$new'),
    } as unknown as PasswordService;
    const service = new AuthService(
      prisma,
      password,
      {} as unknown as TokenService,
      {} as unknown as EmailQueueService,
    );
    return { service, passwordResetToken, refreshToken, user, password };
  }

  it('jeton valide : met à jour le hash, consomme le jeton et révoque les sessions', async () => {
    const { service, passwordResetToken, refreshToken, user, password } = makeReset({});

    await service.resetPassword({ token: 'raw', newPassword: 'N3wP@ssword' });

    expect(passwordResetToken.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashResetToken('raw') } }),
    );
    expect(password.hash).toHaveBeenCalledWith('N3wP@ssword');
    // Consommation atomique du jeton ciblé.
    expect(passwordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'prt1', usedAt: null } }),
    );
    expect(user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: 'argon$new' },
    });
    // Toutes les sessions actives révoquées.
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('jeton inconnu → 400 INVALID_RESET_TOKEN', async () => {
    const { service, user } = makeReset({ record: null });
    await expect(
      service.resetPassword({ token: 'x', newPassword: 'N3wP@ssword' }),
    ).rejects.toMatchObject({ status: 400, response: { error: 'INVALID_RESET_TOKEN' } });
    expect(user.update).not.toHaveBeenCalled();
  });

  it('jeton déjà consommé → 400', async () => {
    const { service } = makeReset({
      record: {
        id: 'prt1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
      },
    });
    await expect(
      service.resetPassword({ token: 'x', newPassword: 'N3wP@ssword' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('jeton expiré → 400', async () => {
    const { service } = makeReset({
      record: { id: 'prt1', userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      service.resetPassword({ token: 'x', newPassword: 'N3wP@ssword' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('compte supprimé entre-temps → 400', async () => {
    const { service, password } = makeReset({ user: null });
    await expect(
      service.resetPassword({ token: 'x', newPassword: 'N3wP@ssword' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(password.hash).not.toHaveBeenCalled();
  });

  it('course : jeton consommé pendant la transaction (count=0) → 400, rollback', async () => {
    const { service, user } = makeReset({ consumedCount: 0 });
    await expect(
      service.resetPassword({ token: 'x', newPassword: 'N3wP@ssword' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(user.update).not.toHaveBeenCalled();
  });
});
