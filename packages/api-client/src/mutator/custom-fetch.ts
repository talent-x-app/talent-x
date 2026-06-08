/**
 * Mutator du client API généré (TLX-008).
 * Toutes les fonctions générées par orval passent par `customFetch`, qui :
 *  - préfixe l'URL de base (configurable, jamais en dur — cf. règles projet),
 *  - injecte des en-têtes fournis dynamiquement (seam pour l'auth/refresh, TLX-009),
 *  - renvoie l'enveloppe typée `{ status, data, headers }` attendue par orval.
 *
 * Conformément au client `fetch` d'orval, les statuts d'erreur font partie du
 * type de retour (union discriminée par `status`) : ce mutator ne lève pas. La
 * politique de gestion d'erreur (TanStack Query) est décidée en TLX-009.
 *
 * L'app appelle `configureApiClient` au démarrage pour fournir l'URL de base
 * (depuis la config d'environnement) puis, plus tard, les en-têtes d'auth.
 * Ce module ne connaît ni JWT ni refresh : c'est TLX-009.
 */

export interface ApiClientConfig {
  /** URL de base de l'API, ex. `https://api.talent-x.example/api/v1`. */
  baseUrl: string;
  /**
   * En-têtes ajoutés à chaque requête (ex. `Authorization`). Résolu à chaque
   * appel pour suivre la rotation des jetons. Branché en TLX-009.
   */
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  /**
   * Tentative de rafraîchissement de la session sur réponse 401. Si elle
   * renvoie `true`, la requête initiale est rejouée **une seule fois** avec des
   * en-têtes frais. L'implémentation (rotation du refresh token, single-flight,
   * déconnexion en cas d'échec) vit côté app — TLX-009. Ce module reste agnostique.
   */
  refreshAuth?: () => Promise<boolean>;
}

let config: ApiClientConfig = { baseUrl: '' };

/** Configure le client (URL de base, fournisseur d'en-têtes). Idempotent. */
export function configureApiClient(next: Partial<ApiClientConfig>): void {
  config = { ...config, ...next };
}

/** Réinitialise la configuration — utile pour les tests. */
export function resetApiClient(): void {
  config = { baseUrl: '' };
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  return contentType.includes('application/json') ? JSON.parse(text) : text;
}

async function sendOnce(url: string, init: RequestInit): Promise<Response> {
  const dynamicHeaders = (await config.getHeaders?.()) ?? {};
  return fetch(joinUrl(config.baseUrl, url), {
    ...init,
    headers: {
      ...dynamicHeaders,
      ...init.headers,
    },
  });
}

export const customFetch = async <T>(url: string, init: RequestInit = {}): Promise<T> => {
  let response = await sendOnce(url, init);

  // Intercepteur d'auth : un 401 déclenche un rafraîchissement (fourni par l'app)
  // puis un unique rejeu avec les nouveaux en-têtes. `refreshAuth` est responsable
  // d'être single-flight et de ne pas repasser par cet intercepteur (cf. TLX-009).
  if (response.status === 401 && config.refreshAuth) {
    const refreshed = await config.refreshAuth();
    if (refreshed) {
      response = await sendOnce(url, init);
    }
  }

  const data = await parseBody(response);

  // Enveloppe attendue par le client `fetch` d'orval (cf. *Response types générés).
  return { status: response.status, data, headers: response.headers } as T;
};
