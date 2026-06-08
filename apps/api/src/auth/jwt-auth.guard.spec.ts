import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { type TokenService } from './token.service';

function makeCtx(headers: Record<string, string | undefined>) {
  const req: { headers: typeof headers; user?: { id: string; role: string } } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, req };
}

function makeGuard(isPublic: boolean, verify: jest.Mock = jest.fn()) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
  const tokens = { verifyAccessToken: verify } as unknown as TokenService;
  return new JwtAuthGuard(reflector, tokens);
}

describe('JwtAuthGuard (TLX-022)', () => {
  it('laisse passer une route @Public sans token', () => {
    const guard = makeGuard(true);
    expect(guard.canActivate(makeCtx({}).context)).toBe(true);
  });

  it('autorise un Bearer valide et attache l’utilisateur', () => {
    const verify = jest.fn().mockReturnValue({ id: 'u1', role: 'coach' });
    const guard = makeGuard(false, verify);
    const { context, req } = makeCtx({ authorization: 'Bearer abc.def.ghi' });

    expect(guard.canActivate(context)).toBe(true);
    expect(verify).toHaveBeenCalledWith('abc.def.ghi');
    expect(req.user).toEqual({ id: 'u1', role: 'coach' });
  });

  it('401 sans en-tête Authorization', () => {
    const guard = makeGuard(false);
    expect(() => guard.canActivate(makeCtx({}).context)).toThrow(UnauthorizedException);
  });

  it('401 si l’en-tête n’est pas un Bearer', () => {
    const guard = makeGuard(false);
    expect(() => guard.canActivate(makeCtx({ authorization: 'Basic xyz' }).context)).toThrow(
      UnauthorizedException,
    );
  });

  it('401 si le token est invalide', () => {
    const verify = jest.fn(() => {
      throw new Error('invalide');
    });
    const guard = makeGuard(false, verify);
    expect(() => guard.canActivate(makeCtx({ authorization: 'Bearer abc' }).context)).toThrow(
      UnauthorizedException,
    );
  });
});
