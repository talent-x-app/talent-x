import { Test } from '@nestjs/testing';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const service = {
    register: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
  } as unknown as jest.Mocked<AuthService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('register délègue le DTO au service', async () => {
    const dto = { email: 'c@e.com', password: 'SecureP@ss123', role: 'coach' as const };
    const session = { accessToken: 'a', refreshToken: 'r', expiresIn: 900, user: {} as never };
    service.register.mockResolvedValue(session);

    await expect(controller.register(dto)).resolves.toBe(session);
    expect(service.register).toHaveBeenCalledWith(dto);
  });

  it('logout transmet le corps et l’utilisateur courant', async () => {
    const user: AuthenticatedUser = { id: 'u1', role: 'athlete' };
    service.logout.mockResolvedValue(undefined);

    await controller.logout({ refreshToken: 'r' }, user);
    expect(service.logout).toHaveBeenCalledWith({ refreshToken: 'r' }, user);
  });
});
