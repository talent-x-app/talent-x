import { type Page } from '@playwright/test';

/**
 * Socle d'interception réseau réutilisable (cf. COVERAGE_MATRIX §5 « erreurs réseau » / §8).
 *
 * On cible par **segment de chemin** (`/api/v1/...`) et non par hôte : l'app web appelle
 * `EXPO_PUBLIC_API_URL` (hôte variable selon l'env de build) ; seul le chemin est stable.
 *
 * Doctrine de profondeur (§3.1) :
 *  - `failApi`  → cas **E** (toast + retry). À fond 1× au transverse par statut, smoke ailleurs.
 *  - `goOffline`/`restoreApi` → cas **O** (bandeau hors-ligne). 1 test transverse.
 *  - `slowApi`  → cas **L** (état `*-loading`).
 *  - `mockApi`  → forcer une réponse (∅ via liste vide, ou payload contrôlé).
 */

/** Base de chemin de l'API (sans hôte). Surchargeable si la version d'API change. */
const API_PATH = process.env.E2E_API_PATH ?? '/api/v1';

/**
 * Construit un matcher d'URL d'API à partir d'un fragment de chemin, indépendamment de l'hôte.
 * Un `*` dans le fragment devient un joker de segment (matche un id, ex. `sessions/<id>`).
 * Les fragments sont des chemins REST simples (segments + joker), sans méta-caractères regex.
 * Exemples : `groups`, `sessions/*` (un id), `assignments/<id>/performance`.
 */
export function apiMatcher(pathFragment: string): RegExp {
  const frag = pathFragment.replace(/^\//, '').replace(/\*/g, '[^/]+');
  return new RegExp(`${API_PATH}/${frag}`);
}

/**
 * Force une réponse JSON sur les requêtes d'API qui matchent (200 par défaut).
 * Utile pour un état **vide** (`mockApi(page, 'notifications', { data: [] })`) ou un payload
 * contrôlé sans dépendre du seed. Le caller fournit la forme exacte (le contrat fait foi).
 */
export async function mockApi(
  page: Page,
  pathFragment: string,
  body: unknown,
  status = 200,
): Promise<void> {
  await page.route(apiMatcher(pathFragment), (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/**
 * Force un statut d'**erreur** serveur (cas E : toast + retry). Par défaut 500.
 * Ex. `failApi(page, 'sessions', 500)` ou `failApi(page, 'groups', 422, { message: '…' })`.
 */
export async function failApi(
  page: Page,
  pathFragment: string,
  status = 500,
  body: unknown = { message: `E2E forced ${status}` },
): Promise<void> {
  await mockApi(page, pathFragment, body, status);
}

/**
 * Diffère la réponse d'une API pour observer l'état de **chargement** (`*-loading`).
 * Laisse passer la vraie requête après `delayMs`.
 */
export async function slowApi(page: Page, pathFragment: string, delayMs = 1500): Promise<void> {
  await page.route(apiMatcher(pathFragment), async (route) => {
    await new Promise((r) => setTimeout(r, delayMs));
    await route.continue();
  });
}

/**
 * Coupe le réseau API (cas **O** hors-ligne) : abort de toute requête `/api/v1/*`.
 * Déclenche le bandeau hors-ligne + le mode brouillon. Restaurer avec `restoreApi`.
 */
export async function goOffline(page: Page): Promise<void> {
  await page.route(new RegExp(API_PATH), (route) => route.abort('internetdisconnected'));
}

/** Retire toutes les interceptions posées (retour réseau nominal / fin de test). */
export async function restoreApi(page: Page): Promise<void> {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
}

/**
 * Stub **stateful** du centre de notifications, sans dépendre du worker async (Redis).
 * Le feed `GET /notifications` renvoie une notif **non lue** (`unreadCount: 1`) jusqu'à l'appel
 * `POST /notifications/read-all`, après quoi il la renvoie **lue** (`unreadCount: 0`). Permet de
 * tester l'auto-marquage + le badge de façon déterministe — le round-trip worker reste couvert
 * par `tlx-140`. Renvoie une sonde `wasReadAllCalled()`. Les autres routes `notifications/*`
 * (ex. `preferences`) passent au vrai backend.
 */
export async function stubNotifications(
  page: Page,
  opts: { type?: string; resourceId?: string; id?: string } = {},
): Promise<{ wasReadAllCalled: () => boolean }> {
  let readAll = false;
  const id = opts.id ?? 'stub-notif-1';
  const type = opts.type ?? 'performance_submitted';
  const resourceId = opts.resourceId ?? 'stub-resource';
  const now = () => new Date().toISOString();

  await page.route(apiMatcher('notifications'), async (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() === 'POST' && url.includes('/notifications/read-all')) {
      readAll = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { updated: 1 } }),
      });
    }
    // Feed : `/notifications` ou `/notifications?...` (pas les sous-ressources).
    if (req.method() === 'GET' && /\/notifications(\?|$)/.test(url)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id, type, resourceId, createdAt: now(), ...(readAll ? { readAt: now() } : {}) }],
          meta: { total: 1, page: 1, limit: 50, hasNext: false },
          unreadCount: readAll ? 0 : 1,
        }),
      });
    }
    return route.continue();
  });

  return { wasReadAllCalled: () => readAll };
}
