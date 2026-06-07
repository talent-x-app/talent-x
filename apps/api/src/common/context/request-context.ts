import { AsyncLocalStorage } from 'node:async_hooks';

/** Données propagées implicitement pendant le traitement d'une requête. */
export interface RequestContext {
  requestId: string;
}

/**
 * Stockage par requête (correlation ID). Alimenté par RequestIdMiddleware et lu
 * par le logger JSON et le filtre d'exceptions pour corréler tous les logs et la
 * réponse d'erreur d'une même requête.
 */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Correlation ID de la requête courante, si disponible. */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}
