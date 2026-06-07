import type { NextFunction, Request, Response } from 'express';
import { getRequestId } from '../context/request-context';
import { REQUEST_ID_HEADER, RequestIdMiddleware } from './request-id.middleware';

function mockRes(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  it('réutilise le X-Request-Id entrant et l’expose dans le contexte', () => {
    const req = { headers: { [REQUEST_ID_HEADER]: 'abc-123' } } as unknown as Request;
    const res = mockRes();
    let seen: string | undefined;

    middleware.use(req, res, (() => {
      seen = getRequestId();
    }) as NextFunction);

    expect(seen).toBe('abc-123');
    expect(res.headers[REQUEST_ID_HEADER]).toBe('abc-123');
  });

  it('génère un id quand l’en-tête est absent', () => {
    const req = { headers: {} } as unknown as Request;
    const res = mockRes();
    let seen: string | undefined;

    middleware.use(req, res, (() => {
      seen = getRequestId();
    }) as NextFunction);

    expect(seen).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers[REQUEST_ID_HEADER]).toBe(seen);
  });
});
