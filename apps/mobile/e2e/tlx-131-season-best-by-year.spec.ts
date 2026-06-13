import { test, expect } from './fixtures';

/**
 * TLX-131 — SB (season best) + tableau de marques par année (ADR-34, A-06/A-07, miroir coach C-03).
 * Athlète avec des marques sur ≥2 années civiles → la carte d'épreuve montre la meilleure de la
 * saison + le tableau par année, et le même rendu s'affiche côté coach (consentement coach_access).
 */

const EVENT = 'sprint:100m';

test('SB + marques par année, côté athlète puis coach', async ({ page, apiSeed }) => {
  const coach = await apiSeed.register('coach', 'Coach', 'SB');
  const athlete = await apiSeed.register('athlete', 'Ath', 'SB');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');
  await apiSeed.grantConsent(athlete.token, 'coach_access');

  // Deux années civiles, même eventKey (sprint:100m) → série multi-années + SB de l'année courante.
  await apiSeed.logTraining(athlete.token, {
    type: 'sprint',
    distanceMeters: 100,
    timeSeconds: 12.1,
    date: '2025-05-04',
  });
  await apiSeed.logTraining(athlete.token, {
    type: 'sprint',
    distanceMeters: 100,
    timeSeconds: 11.7,
    date: '2026-05-04',
  });

  // --- Athlète : Progression (A-06/A-07) ---
  await apiSeed.loginAs(page, athlete);
  await page.getByRole('tab', { name: 'Progression' }).click();
  await expect(page.getByTestId('progress-title')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`progress-series-${EVENT}`)).toBeVisible();
  await expect(page.getByTestId(`progress-sb-${EVENT}`)).toBeVisible();
  await expect(page.getByTestId(`progress-year-${EVENT}-2026`)).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/tlx-131-athlete-progress.png', fullPage: true });

  // --- Coach : miroir C-03 (détail athlète) ---
  await apiSeed.loginAs(page, coach);
  await page.goto(`/athlete/${athlete.id}`);
  await expect(page.getByTestId('athlete-detail-name')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`progress-series-${EVENT}`)).toBeVisible();
  await expect(page.getByTestId(`progress-sb-${EVENT}`)).toBeVisible();
  await expect(page.getByTestId(`progress-year-${EVENT}-2026`)).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/tlx-131-coach-c03.png', fullPage: true });
});
