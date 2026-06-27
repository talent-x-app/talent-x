import { test, expect } from './fixtures';

/**
 * E2E (TLX-198) — navigation post-création de séance.
 *  - « Retour » depuis l'écran d'assignation ne doit PAS revenir dans le flux de création
 *    (le sélecteur « Nouvelle séance » est transitoire, entré en `replace` → hors historique).
 *  - « Assigner plus tard » mène au détail de la séance (déjà enregistrée), sans assigner.
 * Cible Expo web ; seed via l'API (fixtures). Vérifie le vrai comportement Tabs/history.
 */

test.use({ viewport: { width: 414, height: 1000 } });

/**
 * Crée une séance Sprint via l'assistant et s'arrête sur l'écran d'assignation. Renvoie le titre.
 * Part du **dashboard** (comme un vrai coach) pour reproduire l'historique réel : dashboard →
 * « Nouvelle séance » → assistant → assignation.
 */
async function createSprintSessionToAssign(page: import('@playwright/test').Page, apiSeed: any) {
  const coach = await apiSeed.register('coach', 'Nav', 'Coach');
  await apiSeed.loginAs(page, coach);
  await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });
  // En Tabs/web, les écrans restent montés → la **visibilité d'un testID** ne prouve pas le focus.
  // On capture l'URL du dashboard et on la compare après navigation (preuve fiable de l'écran actif).
  const dashboardUrl = page.url();

  // Entrée création depuis le dashboard (`push`) → sélecteur de discipline.
  await page.getByTestId('coach-dashboard-new-session').click();
  await expect(page.getByTestId('new-session-title')).toBeVisible({ timeout: 20_000 });
  // Choix de discipline → assistant (navigation en `replace` : le sélecteur quitte l'historique).
  await page.getByTestId('new-session-discipline-sprint').click();
  await expect(page.getByTestId('sprint-effort-canvas')).toBeVisible({ timeout: 20_000 });

  const title = 'Séance nav E2E';
  await page.getByTestId('session-field-title').fill(title);
  await page.getByTestId('session-save').click();

  // Création réussie → on bascule sur l'assignation (C-06).
  await expect(page.getByTestId('assign-title')).toBeVisible({ timeout: 20_000 });
  expect(page.url()).toContain('/assign/');
  return { title, dashboardUrl };
}

test.describe('TLX-198 — navigation post-création', () => {
  test('« Retour » depuis l’assignation revient au tableau de bord, pas à la création', async ({
    page,
    apiSeed,
  }) => {
    await createSprintSessionToAssign(page, apiSeed);

    // Retour : ne doit PAS retomber dans le flux de création (sélecteur ni builder), mais revenir
    // à l'accueil. L'URL fait foi (les écrans restent montés en Tabs/web).
    await page.getByTestId('assign-back').click();

    // Accueil coach = racine ; surtout : plus aucune route de création ni d'assignation.
    await expect(page).toHaveURL(/localhost:8081\/?(\?.*)?$/, { timeout: 20_000 });
    expect(page.url()).not.toContain('/session/'); // ni sélecteur ni assistant/builder
    expect(page.url()).not.toContain('/assign/');
  });

  test('« Assigner plus tard » mène au détail de la séance (sans assigner)', async ({
    page,
    apiSeed,
  }) => {
    const { title } = await createSprintSessionToAssign(page, apiSeed);

    await page.getByTestId('assign-later').click();

    // On atterrit sur le détail (lecture seule) de la séance créée, avec ses actions.
    await expect(page.getByTestId('coach-session-title')).toHaveText(title, { timeout: 20_000 });
    await expect(page.getByTestId('coach-session-assign')).toBeVisible();
    // L'assignation n'a pas été déclenchée : pas d'écran de confirmation.
    await expect(page.getByTestId('assign-confirmation')).toBeHidden();
  });
});
