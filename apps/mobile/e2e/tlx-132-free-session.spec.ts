import { test, expect } from './fixtures';

/**
 * TLX-132 — Journal d'entraînement / séance libre (ADR-36, A-06). L'athlète enregistre une séance
 * libre depuis Progression → la marque alimente la progression (série + SB). Un coach lié
 * (consentement coach_access) la voit en progression, mais pas dans son tableau de bord (self_logged).
 */

const EVENT = 'sprint:100m';

test('saisie séance libre → progression alimentée, absente du dashboard coach', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Free');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Free');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');
  await apiSeed.grantConsent(athlete.token, 'coach_access');

  await apiSeed.loginAs(page, athlete);
  await page.getByRole('tab', { name: 'Progression' }).click();
  await expect(page.getByTestId('progress-title')).toBeVisible({ timeout: 20_000 });

  // Ouvrir + remplir le formulaire de séance libre (sprint 100 m).
  await page.getByTestId('free-session-open').click();
  await expect(page.getByTestId('free-session-form')).toBeVisible();
  await page.getByTestId('free-session-title').fill('Sprint 100m perso');
  await page.getByTestId('free-session-date').fill('2026-05-20');
  await page.getByTestId('free-family-sprint').click();
  await page.getByTestId('free-distance').fill('100');
  await page.getByTestId('free-mark').fill('11.9');
  await page.getByTestId('free-rpe').fill('7');
  await page.getByTestId('free-submit').click();

  // Succès : le formulaire se replie (repli = retour au bouton d'ouverture).
  await expect(page.getByTestId('free-session-open')).toBeVisible({ timeout: 15_000 });
  // La marque apparaît dans la progression (série + SB).
  await expect(page.getByTestId(`progress-series-${EVENT}`)).toBeVisible();
  await expect(page.getByTestId(`progress-sb-${EVENT}`)).toBeVisible();
  await expect(page.getByTestId(`progress-year-${EVENT}-2026`)).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/tlx-132-athlete-progress.png', fullPage: true });

  // Coach : la marque est visible en progression de l'athlète…
  await apiSeed.loginAs(page, coach);
  await page.goto(`/athlete/${athlete.id}`);
  await expect(page.getByTestId('athlete-detail-name')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`progress-series-${EVENT}`)).toBeVisible();

  // …mais la séance libre (self_logged) n'alimente PAS le tableau de bord coach :
  // aucune entrée « à revoir » pour cet athlète (la perf self_logged est exclue).
  await page.goto('/');
  await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`coach-dashboard-toreview-${athlete.id}`)).toHaveCount(0);
  await page.screenshot({ path: 'e2e/__screens__/tlx-132-coach-dashboard.png', fullPage: true });
});
