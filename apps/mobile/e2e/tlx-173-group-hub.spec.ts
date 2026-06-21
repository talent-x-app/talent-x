import { test, expect } from './fixtures';

/**
 * TLX-173 / ADR-44 — IA athlète recentrée. Parcours : onglet **Séances** unifié (bascule
 * Liste ⇄ Calendrier) → ouvrir une séance → **présence** (RSVP, ADR-43 §1) dans le détail unique →
 * onglet **Groupe** (hub mince : coéquipiers + infos). Le fil n'est plus dupliqué dans le groupe.
 */

const DUE = '2026-06-21';

test('athlète : Séances (liste/calendrier) → détail + présence → onglet Groupe', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Hub');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Hub');
  const group = await apiSeed.createGroup(coach.token, 'Sprint Élite');
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');
  const sessionId = await apiSeed.createSession(coach.token, { title: 'Test 150 m chrono' });
  const [assignment] = await apiSeed.assign(coach.token, sessionId, {
    athleteIds: [athlete.id],
    dueDate: DUE,
  });

  await apiSeed.loginAs(page, athlete);

  // --- Onglet Séances unifié : vue Liste par défaut ---
  await apiSeed.gotoAuthed(page, '/sessions', 'sessions-view-tabs');
  await expect(page.getByTestId(`session-item-${assignment.id}`)).toBeVisible({ timeout: 15_000 });

  // --- Ouvrir la séance → détail unique avec contrôle de présence ---
  await page.getByTestId(`session-item-${assignment.id}`).click();
  await expect(page.getByTestId('session-detail-title')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('presence-control')).toBeVisible();
  // Déclarer « Présent » (RSVP, ADR-43 §1) — pas de changement de statut (orthogonal).
  await page.getByTestId('presence-going').click();
  await page.screenshot({ path: 'e2e/__screens__/tlx-173-detail-presence.png', fullPage: true });
  await page.goBack();

  // --- Bascule vers la vue Calendrier (même onglet Séances) ---
  await page.getByTestId('sessions-view-tabs-calendar').click();
  await expect(page.getByTestId('calendar-competitions-link')).toBeVisible({ timeout: 15_000 });

  // --- Onglet Groupe : hub mince (coéquipiers + infos), aucun fil de séances ---
  await apiSeed.gotoAuthed(page, '/groups', 'athlete-group-tabs');
  await expect(page.getByTestId('athlete-group-name')).toHaveText(/Sprint Élite/);
  await page.screenshot({ path: 'e2e/__screens__/tlx-173-group-hub.png', fullPage: true });
});
