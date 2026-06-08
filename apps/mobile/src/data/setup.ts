/**
 * Câblage de la couche données (TLX-009).
 * Configure le client API généré (TLX-008) avec l'URL de base d'environnement
 * et l'intercepteur d'auth/refresh, puis hydrate les jetons depuis le trousseau.
 * À appeler une fois au démarrage de l'app (cf. app/_layout.tsx).
 */
import { configureApiClient } from '@talent-x/api-client';
import { getAuthHeaders, refreshAuth } from '../auth/auth';
import { loadTokens } from '../auth/token-store';
import { apiBaseUrl } from '../config/env';

let configured = false;

/** Configure le client API (idempotent) et hydrate la session. */
export async function setupApiClient(): Promise<void> {
  if (!configured) {
    configureApiClient({
      baseUrl: apiBaseUrl,
      getHeaders: getAuthHeaders,
      refreshAuth,
    });
    configured = true;
  }
  await loadTokens();
}
