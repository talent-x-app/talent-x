import {
  ArgumentsHost,
  ConflictException,
  NotImplementedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Construit un ArgumentsHost minimal capturant la réponse JSON émise. */
function mockHost(): {
  host: ArgumentsHost;
  captured: { status?: number; body?: Record<string, unknown> };
} {
  const captured: { status?: number; body?: Record<string, unknown> } = {};
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
      return this;
    },
  };
  const request = { url: '/api/v1/test', method: 'POST' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('mappe une HttpException standard sur un code stable dérivé du statut', () => {
    const { host, captured } = mockHost();

    filter.catch(new NotImplementedException('register'), host);

    expect(captured.status).toBe(501);
    expect(captured.body).toMatchObject({
      statusCode: 501,
      error: 'NOT_IMPLEMENTED',
      message: 'register',
      path: '/api/v1/test',
    });
    expect(captured.body?.timestamp).toEqual(expect.any(String));
  });

  it('conserve un code stable custom (UPPER_SNAKE) fourni par l’exception', () => {
    const { host, captured } = mockHost();

    filter.catch(
      new ConflictException({
        error: 'TOKEN_REUSE_DETECTED',
        message: 'Refresh token déjà consommé',
      }),
      host,
    );

    expect(captured.status).toBe(409);
    expect(captured.body).toMatchObject({
      error: 'TOKEN_REUSE_DETECTED',
      message: 'Refresh token déjà consommé',
    });
  });

  it('transforme les messages class-validator en details[] avec code VALIDATION_FAILED', () => {
    const { host, captured } = mockHost();

    filter.catch(
      new UnprocessableEntityException(['email must be an email', 'password too short']),
      host,
    );

    expect(captured.status).toBe(422);
    expect(captured.body?.error).toBe('VALIDATION_FAILED');
    expect(captured.body?.details).toEqual([
      { message: 'email must be an email' },
      { message: 'password too short' },
    ]);
  });

  it('mappe une erreur inconnue sur 500 INTERNAL_ERROR', () => {
    const { host, captured } = mockHost();

    filter.catch(new Error('boom'), host);

    expect(captured.status).toBe(500);
    expect(captured.body).toMatchObject({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
    });
  });
});
