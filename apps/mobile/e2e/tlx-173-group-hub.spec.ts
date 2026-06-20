import { test, expect } from './fixtures';

/**
 * TLX-173 — Hub de groupe athlète (ADR-43, Phase A, affichage). Parcours : l'athlète membre ouvre
 * son groupe → onglet Séances (carte next-up) → ouvre une séance → retour → onglet Calendrier →
 * sélectionne le jour de la séance → la séance y apparaît. Lecture seule (présence/perf = Phase B).
 *
 * Le fil lit `GET /assignments` (toutes les séances de l'athlète, pas de provenance de groupe avant
 * le Lot 2, ADR-30/§4). La route détail (`/group/session/[id]`) reçoit l'id de l'AFFECTATION.
 */

const DUE = '2026-06-21';

test('athlète : groupe → Séances → ouvre une séance → retour → Calendrier → sélection du jour', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Hub');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Hub');
  const group = await apiSeed.createGroup(coach.token, 'Sprint Élite');
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  const sessionId = await apiSeed.createSession(coach.token, { title: 'Test 150 m chrono' });
  const [assignment] = await apiSeed.assign(coach.token, sessionId, {
    athleteIds: [athlete.id],
    dueDate: DUE,
  });

  await apiSeed.loginAs(page, athlete);

  // --- Hub : en-tête + onglets (Séances par défaut) ---
  await apiSeed.gotoAuthed(page, `/group/${group.id}`, 'athlete-group-tabs');
  await expect(page.getByTestId('athlete-group-name')).toHaveText(/Sprint Élite/);
  await expect(page.getByTestId('group-next-up')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('group-next-up')).toContainText('Test 150 m chrono');
  await page.screenshot({ path: 'e2e/__screens__/tlx-173-hub-sessions.png', fullPage: true });

  // --- Ouvre la séance depuis la carte next-up ---
  await page.getByTestId('group-next-up').click();
  await expect(page.getByTestId('group-session-title')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('group-session-title')).toContainText('Test 150 m chrono');
  await page.screenshot({ path: 'e2e/__screens__/tlx-173-session-detail.png', fullPage: true });

  // --- Retour au hub ---
  await page.getByTestId('group-session-back').click();
  await expect(page.getByTestId('athlete-group-tabs')).toBeVisible({ timeout: 15_000 });

  // --- Onglet Calendrier → sélection du jour de la séance ---
  await page.getByRole('tab', { name: 'Calendrier' }).click();
  await expect(page.getByTestId('group-calendar-period')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`group-calendar-cell-${DUE}`).click();
  await expect(page.getByTestId(`group-session-${assignment.id}`)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'e2e/__screens__/tlx-173-calendar-day.png', fullPage: true });
});
