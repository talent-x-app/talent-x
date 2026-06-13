import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { HttpMetricsService } from './http-metrics.service';

/** Endpoint de scrape exclu de la mesure (il ne se mesure pas lui-même). */
const METRICS_PATH = '/metrics';

/** Route attribuée aux requêtes sans gabarit (404, OPTIONS hors route…) — borne la cardinalité. */
const UNMATCHED_ROUTE = 'unmatched';

/**
 * Mesure chaque requête HTTP (méthode, gabarit de route, statut, durée) et l'inscrit
 * dans `HttpMetricsService` pour l'exposition `/metrics` (métriques applicatives,
 * TX-OPS-004 §7). Enregistré globalement via `APP_INTERCEPTOR`.
 *
 * La mesure est posée sur `res.finish`/`res.close` (et non dans le flux RxJS) afin de
 * capturer le **statut final réel** — y compris celui réécrit par `AllExceptionsFilter`
 * sur une exception — et de compter aussi les connexions interrompues avant réponse.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: HttpMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    // `/metrics` est servi hors préfixe `/api/v1` : on l'exclut pour ne pas se mesurer.
    if (req.path === METRICS_PATH) return next.handle();

    const start = process.hrtime.bigint();
    this.metrics.incInFlight();

    let recorded = false;
    const record = (): void => {
      if (recorded) return;
      recorded = true;
      this.metrics.decInFlight();
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observe({
        method: req.method,
        route: routeLabel(req),
        status: res.statusCode,
        durationSeconds,
      });
    };

    // `finish` : réponse entièrement envoyée. `close` : connexion coupée avant `finish`.
    res.once('finish', record);
    res.once('close', record);

    return next.handle();
  }
}

/**
 * Gabarit de route stable (ex. `/api/v1/athletes/:id/progress`) plutôt que l'URL
 * brute — sinon chaque `id` créerait une série de métrique distincte (explosion de
 * cardinalité). `req.route` n'est peuplé que si une route a matché ; sinon `unmatched`.
 */
function routeLabel(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  if (typeof path !== 'string' || path.length === 0) return UNMATCHED_ROUTE;
  const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
  return `${base}${path}` || UNMATCHED_ROUTE;
}
