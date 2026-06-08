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
