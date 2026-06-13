import { EventEmitter } from 'node:events';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { HttpMetricsService } from './http-metrics.service';

interface FakeReq {
  method: string;
  path: string;
  baseUrl?: string;
  route?: { path: string };
}

function context(req: FakeReq, res: EventEmitter & { statusCode: number }): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

function handler(): CallHandler {
  return { handle: () => of('ok') } as CallHandler;
}

function makeRes(statusCode = 200): EventEmitter & { statusCode: number } {
  return Object.assign(new EventEmitter(), { statusCode });
}

describe('HttpMetricsInterceptor', () => {
  it('mesure une requête sur `finish` avec gabarit de route et statut', async () => {
    const service = new HttpMetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const res = makeRes(200);
    const req: FakeReq = {
      method: 'GET',
      path: '/api/v1/athletes/42/progress',
      baseUrl: '/api/v1',
      route: { path: '/athletes/:id/progress' },
    };

    await lastValueFrom(interceptor.intercept(context(req, res), handler()));
    // En cours pendant le traitement, libéré au finish.
    expect(service.snapshot().inFlight).toBe(1);
    res.emit('finish');

    const snap = service.snapshot();
    expect(snap.inFlight).toBe(0);
    expect(snap.series).toHaveLength(1);
    expect(snap.series[0]).toMatchObject({
      method: 'GET',
      route: '/api/v1/athletes/:id/progress',
      status: '200',
      count: 1,
    });
  });

  it('capture le statut d’erreur final réécrit par le filtre', async () => {
    const service = new HttpMetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const res = makeRes(200);
    const req: FakeReq = {
      method: 'POST',
      path: '/api/v1/sessions',
      baseUrl: '/api/v1',
      route: { path: '/sessions' },
    };

    await lastValueFrom(interceptor.intercept(context(req, res), handler()));
    res.statusCode = 422; // AllExceptionsFilter a posé le statut final
    res.emit('finish');

    expect(service.snapshot().series[0].status).toBe('422');
  });

  it('n’enregistre qu’une fois même si `finish` et `close` surviennent', async () => {
    const service = new HttpMetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const res = makeRes(200);
    const req: FakeReq = {
      method: 'GET',
      path: '/api/v1/health',
      baseUrl: '/api/v1',
      route: { path: '/health' },
    };

    await lastValueFrom(interceptor.intercept(context(req, res), handler()));
    res.emit('finish');
    res.emit('close');

    expect(service.snapshot().series[0].count).toBe(1);
    expect(service.snapshot().inFlight).toBe(0);
  });

  it('classe les requêtes sans route matchée sous `unmatched` (anti-cardinalité)', async () => {
    const service = new HttpMetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const res = makeRes(404);
    const req: FakeReq = { method: 'GET', path: '/api/v1/does-not-exist', baseUrl: '/api/v1' };

    await lastValueFrom(interceptor.intercept(context(req, res), handler()));
    res.emit('finish');

    expect(service.snapshot().series[0]).toMatchObject({ route: 'unmatched', status: '404' });
  });

  it('ne se mesure pas lui-même sur `/metrics`', async () => {
    const service = new HttpMetricsService();
    const interceptor = new HttpMetricsInterceptor(service);
    const res = makeRes(200);
    const req: FakeReq = { method: 'GET', path: '/metrics' };

    await lastValueFrom(interceptor.intercept(context(req, res), handler()));
    res.emit('finish');

    expect(service.snapshot().series).toHaveLength(0);
    expect(service.snapshot().inFlight).toBe(0);
  });
});
