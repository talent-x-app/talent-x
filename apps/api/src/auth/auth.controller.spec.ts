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
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
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

  it('forgotPassword délègue le DTO au service (TLX-104)', async () => {
    service.forgotPassword.mockResolvedValue(undefined);
    await controller.forgotPassword({ email: 'a@e.test' });
    expect(service.forgotPassword).toHaveBeenCalledWith({ email: 'a@e.test' });
  });

  it('resetPassword délègue le DTO au service (TLX-104)', async () => {
    service.resetPassword.mockResolvedValue(undefined);
    await controller.resetPassword({ token: 't', newPassword: 'N3wP@ssword' });
    expect(service.resetPassword).toHaveBeenCalledWith({ token: 't', newPassword: 'N3wP@ssword' });
  });
});
