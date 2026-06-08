/**
 * Intercepteur d'authentification de la couche données (TLX-009).
 *
 *  - `getAuthHeaders` : injecte `Authorization: Bearer <accessToken>` à chaque
 *    requête (résolu à la volée pour suivre la rotation).
 *  - `refreshAuth` : sur 401, rafraîchit la session via le refresh token rotatif.
 *    Le refresh est **à usage unique** et la réutilisation d'un jeton consommé
 *    révoque la famille (409 TOKEN_REUSE_DETECTED) — cf. TX-ARCH-001 §8. En cas
 *    d'échec (401/409/erreur), on efface la session (déconnexion).
 *
 * `refreshAuth` est **single-flight** : des requêtes concurrentes qui prennent un
 * 401 partagent un seul appel de refresh. L'appel de refresh utilise un `fetch`
 * brut (et non le client généré) pour ne PAS repasser par l'intercepteur 401.
 */
import type { AuthTokens } from '@talent-x/api-client';
import { apiBaseUrl } from '../config/env';
import { clearTokens, getTokens, setTokens } from './token-store';

/** En-têtes d'auth pour la requête courante (vide si pas de session). */
export function getAuthHeaders(): HeadersInit {
  const tokens = getTokens();
  return tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {};
}

let inFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const tokens = getTokens();
  if (!tokens) return false;

  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!response.ok) {
      // 401 (refresh invalide/expiré) ou 409 (réutilisation détectée) → déconnexion.
      await clearTokens();
      return false;
    }

    const next = (await response.json()) as AuthTokens;
    await setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
    return true;
  } catch {
    // Erreur réseau : on ne déconnecte pas (jetons conservés pour une reprise).
    return false;
  }
}

/** Rafraîchit la session (single-flight). Renvoie `true` si la session est valide. */
export function refreshAuth(): Promise<boolean> {
  inFlight ??= doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
