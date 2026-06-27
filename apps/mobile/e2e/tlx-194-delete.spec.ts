import { test, expect } from './fixtures';

/**
 * E2E (TLX-194) — suppression d'une séance depuis le détail.
 * Régression visée : après suppression (soft-delete), un refetch de la séance désormais
 * introuvable déclenchait des toasts d'erreur « Séance introuvable » en plus du succès.
 * On vérifie : confirmation → suppression → toast de succès, **sans** toast d'erreur 404.
 */

test.use({ viewport: { width: 414, height: 1000 } });

test('supprimer une séance : succès sans toast d’erreur « introuvable »', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Del', 'Coach');
  await apiSeed.loginAs(page, coach);
  await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });

  // Créer une séance (assistant Sprint) puis rejoindre son détail via « Assigner plus tard ».
  await page.getByTestId('coach-dashboard-new-session').click();
  await expect(page.getByTestId('new-session-title')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('new-session-discipline-sprint').click();
  await expect(page.getByTestId('sprint-effort-canvas')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('session-field-title').fill('À supprimer E2E');
  await page.getByTestId('session-save').click();
  await expect(page.getByTestId('assign-title')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('assign-later').click();
  await expect(page.getByTestId('coach-session-title')).toBeVisible({ timeout: 20_000 });

  // Supprimer : confirmation inline requise, puis DELETE.
  await page.getByTestId('coach-session-delete').click();
  await page.getByTestId('coach-session-delete-confirm').click();

  // Toast de succès affiché…
  await expect(page.getByText('Séance supprimée')).toBeVisible({ timeout: 20_000 });
  // …et AUCUN toast d'erreur « introuvable » (le refetch 404 ne doit pas remonter).
  await expect(page.getByText(/introuvable/i)).toHaveCount(0);
  // On a quitté le détail.
  expect(page.url()).not.toContain('/session/');
});
