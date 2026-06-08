import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { type Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import type { Role } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

function makeCtx(user?: AuthenticatedUser) {
  const req: { user?: AuthenticatedUser } = { user };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return context;
}

function makeGuard(required: Role[] | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(required),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard (TLX-024)', () => {
  it('laisse passer une route sans @Roles', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeCtx())).toBe(true);
  });

  it('laisse passer si la liste de rôles requis est vide', () => {
    const guard = makeGuard([]);
    expect(guard.canActivate(makeCtx({ id: 'u1', role: 'athlete' }))).toBe(true);
  });

  it('autorise un utilisateur dont le rôle est requis', () => {
    const guard = makeGuard(['coach']);
    expect(guard.canActivate(makeCtx({ id: 'c1', role: 'coach' }))).toBe(true);
  });

  it('autorise si le rôle figure parmi plusieurs rôles acceptés', () => {
    const guard = makeGuard(['coach', 'athlete']);
    expect(guard.canActivate(makeCtx({ id: 'a1', role: 'athlete' }))).toBe(true);
  });

  it('403 si le rôle ne correspond pas', () => {
    const guard = makeGuard(['coach']);
    expect(() => guard.canActivate(makeCtx({ id: 'a1', role: 'athlete' }))).toThrow(
      ForbiddenException,
    );
  });

  it('403 si aucun utilisateur n’est attaché à la requête', () => {
    const guard = makeGuard(['coach']);
    expect(() => guard.canActivate(makeCtx(undefined))).toThrow(ForbiddenException);
  });
});
