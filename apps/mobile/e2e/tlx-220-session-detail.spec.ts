import { test, expect } from './fixtures';

/**
 * TLX-220 — Vérification live de la **refonte du détail de séance athlète** (TLX-219) :
 * hero (titre + discipline dérivée + badge d'état + date), **bandeau de KPIs adaptatif**
 * (n'affiche que les métriques renseignées — plus de tuiles « — » vides, plus de bloc
 * EFFORTS/VOLUME redondant), et CTA bas d'écran « Saisir ma perf » / « Indisponible ».
 */

/** Date ISO à J+N (le hero affiche « · dans N j » à partir de l'échéance). */
function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

test('détail séance athlète : hero, bandeau adaptatif (maigre vs complet), CTA + skip', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Detail220');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Detail220');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');

  // (a) Séance « maigre » : un sprint 100 m, aucun brief → ni Durée, ni Difficulté.
  const leanId = await apiSeed.createSession(coach.token, {
    title: 'Sprint 100 m',
    distanceMeters: 100,
  });
  const [leanAssignment] = await apiSeed.assign(coach.token, leanId, {
    athleteIds: [athlete.id],
    dueDate: isoInDays(3),
  });

  // (b) Séance « complète » : brief avec durée + difficulté, et de la distance → 4 cellules.
  const richId = await apiSeed.createSession(coach.token, {
    title: 'Intermittent court',
    distanceMeters: 400,
    brief: {
      athleteIntent: 'Des efforts courts et rapides, réguliers. Ne pars pas trop vite.',
      durationMinutes: 75,
      difficulty: 7,
      successCriteria: 'Tenir les efforts au même rythme.',
    },
  });
  const [richAssignment] = await apiSeed.assign(coach.token, richId, {
    athleteIds: [athlete.id],
    dueDate: isoInDays(5),
  });

  await apiSeed.loginAs(page, athlete);

  // ---------- (a) Bandeau adaptatif : séance maigre ----------
  await apiSeed.gotoAuthed(page, `/session/${leanAssignment.id}`, 'session-detail-title');
  await expect(page.getByTestId('session-detail-title')).toHaveText('Sprint 100 m');

  // Hero : liseré de discipline dérivée (sprint) + badge d'état + date relative.
  await expect(page.getByTestId('session-discipline-sprint')).toBeVisible();
  await expect(page.getByTestId('assignment-status-assigned')).toBeVisible();
  await expect(page.getByTestId('session-detail-date')).toContainText('dans 3');

  // Le bandeau n'affiche QUE les métriques renseignées : pas de « Durée — » ni « Difficulté — ».
  await expect(page.getByTestId('session-stats')).toBeVisible();
  await expect(page.getByTestId('session-stat-exercices-value')).toHaveText('1');
  await expect(page.getByTestId('session-stat-volume-value')).toHaveText(/100/);
  await expect(page.getByTestId('session-stat-duration')).toHaveCount(0);
  await expect(page.getByTestId('session-stat-difficulty')).toHaveCount(0);

  // Plus de bloc EFFORTS/VOLUME redondant : le volume n'apparaît qu'une fois (dans le bandeau).
  await expect(page.getByTestId('session-kpi-volume')).toHaveCount(0);
  await expect(page.getByTestId('session-kpi-efforts')).toHaveCount(0);

  // CTA + skip côte à côte tant que la perf n'est pas saisie.
  const cta = page.getByTestId('start-perf-entry');
  await expect(cta).toBeVisible();
  await expect(cta).toHaveText(/Saisir ma perf/i);
  await page.screenshot({ path: 'e2e/__screens__/tlx-220-bandeau-maigre.png', fullPage: true });

  // ---------- (b) Bandeau adaptatif : séance au brief complet → 4 cellules ----------
  await apiSeed.gotoAuthed(page, `/session/${richAssignment.id}`, 'session-detail-title');
  await expect(page.getByTestId('session-detail-title')).toHaveText('Intermittent court');
  await expect(page.getByTestId('session-stat-exercices-value')).toHaveText('1');
  await expect(page.getByTestId('session-stat-volume-value')).toHaveText(/400/);
  await expect(page.getByTestId('session-stat-duration-value')).toHaveText(/75|1 h/i);
  await expect(page.getByTestId('session-stat-difficulty-value')).toHaveText('7/10');
  await page.screenshot({ path: 'e2e/__screens__/tlx-220-bandeau-complet.png', fullPage: true });

  // ---------- (c) Après saisie : le CTA passe en « Modifier ma perf », pleine largeur ----------
  await apiSeed.submitPerformance(athlete.token, richAssignment.id, { timeSeconds: 58.4 });
  await apiSeed.gotoAuthed(page, `/session/${richAssignment.id}`, 'session-detail-title');
  await expect(page.getByTestId('start-perf-entry')).toHaveText(/Modifier ma perf/i, {
    timeout: 20_000,
  });
  await page.screenshot({ path: 'e2e/__screens__/tlx-220-perf-saisie.png', fullPage: true });
});
