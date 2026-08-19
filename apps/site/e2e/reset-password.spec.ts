import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Parcours de réinitialisation servi par le site public (TLX-234, ADR-57) — c'est
 * l'écran sur lequel atterrit le lien de l'email. L'API est interceptée : ce qui est
 * vérifié ici est la page, pas le backend (déjà couvert côté API).
 *
 * Le scénario QA-01.5 qui a levé le défaut se rejoue en réel contre le staging ; ces
 * tests garantissent qu'on n'y arrive pas avec une page cassée.
 */
const RESET_ENDPOINT = 'http://api.test/api/v1/auth/reset-password';
const TOKEN = 'jeton-de-test-123';

/** Répond à la place de l'API, préflight CORS compris (la page est sur une autre origine). */
async function stubResetEndpoint(
  page: Page,
  respond: (route: Route) => Promise<void> | void,
): Promise<{ bodies: string[] }> {
  const bodies: string[] = [];
  await page.route(RESET_ENDPOINT, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type',
        },
      });
      return;
    }
    bodies.push(route.request().postData() ?? '');
    await respond(route);
  });
  return { bodies };
}

const ok = (route: Route) =>
  route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });

const failing = (status: number) => (route: Route) =>
  route.fulfill({
    status,
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    body: JSON.stringify({ statusCode: status, error: 'ERR', message: 'nope' }),
  });

test('le jeton disparaît de l’URL dès l’ouverture de la page', async ({ page }) => {
  await page.goto(`/reset-password?token=${TOKEN}`);

  // Il ne doit rester ni dans la barre d'adresse, ni dans l'historique (replaceState).
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(page.url()).not.toContain(TOKEN);
  await expect(page.getByTestId('reset-form')).toBeVisible();
});

test('mot de passe changé : le jeton retiré de l’URL est bien celui envoyé à l’API', async ({
  page,
}) => {
  const stub = await stubResetEndpoint(page, ok);
  await page.goto(`/reset-password?token=${TOKEN}`);

  await page.getByTestId('password').fill('Sup3rSecret!');
  await page.getByTestId('confirm').fill('Sup3rSecret!');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('message')).toContainText('Mot de passe changé');
  await expect(page.getByTestId('reset-form')).toBeHidden();
  // Le contrat attend `newPassword`, et le jeton survit au nettoyage de l'URL.
  expect(JSON.parse(stub.bodies[0])).toEqual({ token: TOKEN, newPassword: 'Sup3rSecret!' });
});

test('lien sans jeton : aucun formulaire, message actionnable', async ({ page }) => {
  await page.goto('/reset-password');

  await expect(page.getByTestId('reset-form')).toBeHidden();
  await expect(page.getByTestId('message')).toContainText('Lien incomplet');
});

test('jeton invalide ou expiré (400) : message explicite, formulaire réutilisable', async ({
  page,
}) => {
  await stubResetEndpoint(page, failing(400));
  await page.goto(`/reset-password?token=${TOKEN}`);

  await page.getByTestId('password').fill('Sup3rSecret!');
  await page.getByTestId('confirm').fill('Sup3rSecret!');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('message')).toContainText('invalide, expiré ou déjà utilisé');
  // Le bouton est rendu, sans quoi l'utilisateur resterait bloqué sur un formulaire mort.
  await expect(page.getByTestId('submit')).toBeEnabled();
});

test('saisies incohérentes : refus côté page, aucun appel réseau', async ({ page }) => {
  const stub = await stubResetEndpoint(page, ok);
  await page.goto(`/reset-password?token=${TOKEN}`);

  await page.getByTestId('password').fill('Sup3rSecret!');
  await page.getByTestId('confirm').fill('Sup3rSecre');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('message')).toContainText('ne correspondent pas');
  expect(stub.bodies).toHaveLength(0);
});

test('mot de passe trop court : refus côté page (règle du contrat, 8 caractères)', async ({
  page,
}) => {
  const stub = await stubResetEndpoint(page, ok);
  await page.goto(`/reset-password?token=${TOKEN}`);

  await page.getByTestId('password').fill('court');
  await page.getByTestId('confirm').fill('court');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('message')).toContainText('au moins 8 caractères');
  expect(stub.bodies).toHaveLength(0);
});

test('API injoignable : message de repli, rien ne reste bloqué', async ({ page }) => {
  await page.route(RESET_ENDPOINT, (route) => route.abort('failed'));
  await page.goto(`/reset-password?token=${TOKEN}`);

  await page.getByTestId('password').fill('Sup3rSecret!');
  await page.getByTestId('confirm').fill('Sup3rSecret!');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('message')).toContainText('Connexion impossible');
  await expect(page.getByTestId('submit')).toBeEnabled();
});

test('la page n’émet aucune requête vers un tiers', async ({ page }) => {
  const externalHosts: string[] = [];
  page.on('request', (request) => {
    const host = new URL(request.url()).host;
    if (!host.startsWith('localhost')) externalHosts.push(host);
  });

  await page.goto(`/reset-password?token=${TOKEN}`);
  await expect(page.getByTestId('reset-form')).toBeVisible();

  // ADR-57 : aucun script tiers ni analytics — la police système évite même le CDN
  // de polices qu'importe `design/tokens.css`.
  expect(externalHosts).toEqual([]);
});
