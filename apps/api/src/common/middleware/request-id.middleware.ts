import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from '../context/request-context';

/** En-tête de corrélation (entrant et sortant). */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Établit un correlation ID par requête : réutilise l'en-tête X-Request-Id fourni
 * par le reverse proxy/client s'il est présent, sinon en génère un. Le renvoie au
 * client et l'expose au reste du traitement via AsyncLocalStorage.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId = (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() || randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);
    requestContextStorage.run({ requestId }, () => next());
  }
}
