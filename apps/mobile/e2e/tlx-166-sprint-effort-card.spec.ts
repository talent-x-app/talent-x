import path from 'node:path';
import { test, expect } from './fixtures';

/**
 * E2E (ADR-39, TLX-166) — assistant Sprint avec la **carte d'effort dédiée** (TLX-165) :
 * login coach → « Nouvelle séance » → Sprint → édition de la carte → `POST /sessions` réussi
 * (navigation vers l'écran d'assignation). Cible Expo web ; seed via l'API (fixtures).
 */

const SHOTS = process.env.CAPTURE_DIR ?? 'c:/tmp';

test.use({ viewport: { width: 414, height: 1000 } });

test('assistant Sprint : carte d’effort → création de séance', async ({ page, apiSeed }) => {
  const coach = await apiSeed.register('coach', 'Carte', 'Coach');
  await apiSeed.loginAs(page, coach);

  // « Nouvelle séance » → discipline Sprint → assistant avec la carte d'effort.
  await apiSeed.gotoAuthed(page, '/session/new', 'new-session-title');
  await page.getByTestId('new-session-discipline-sprint').click();
  await expect(page.getByTestId('sprint-effort-canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('effort-0-0')).toBeVisible();

  // Édition via la carte (seed = un effort vierge).
  await page.getByTestId('effort-0-0-dist-60').click();
  await page.getByTestId('effort-0-0-reps-inc').click();
  await page.getByTestId('effort-0-0-reps-inc').click(); // reps → 3
  await page.getByTestId('effort-0-0-series-inc').click(); // séries → 2
  await page.getByTestId('effort-0-0-start-blocks').click();
  await page.getByTestId('effort-0-0-imode-percent_record').click();
  await page.getByTestId('effort-0-0-ivalue-inc').click(); // 95 → 100 %
  await page.getByTestId('effort-0-0-recov-240').click();
  await page.getByTestId('effort-0-0-rtype-passive').click();
  await page.getByTestId('effort-0-0-bigR-480').click();

  // Le résumé live reflète l'édition (phrase + volume, TLX-160).
  await expect(page.getByTestId('sprint-canvas-summary')).toContainText('60 m');

  await page.getByTestId('session-field-title').fill('Carte sprint E2E');
  await page.screenshot({ path: path.join(SHOTS, 'sprint-card-live.png'), fullPage: true });

  // Enregistrer → création réussie → navigation vers l'écran d'assignation (C-06).
  await page.getByTestId('session-save').click();
  await expect(page.getByTestId('assign-title')).toBeVisible({ timeout: 20_000 });
});
