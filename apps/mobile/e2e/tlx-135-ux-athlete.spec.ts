import { test, expect } from './fixtures';

/**
 * TLX-135 — Finitions UX athlète (suivi TLX-92) :
 *  1. Cloche de notifications : badge de non-lues sur l'accueil (athlète & coach) ; tap → centre ;
 *     badge à zéro après ouverture (mark-all-read partagé).
 *  2. Retour de navigation : Profil → centre de notifications → « Retour » revient sur Profil.
 *  3. Badge d'engagement compétition : liste athlète = statut d'engagement (viewerEntryStatus) ;
 *     liste coach = statut de la compétition.
 */

async function waitForNotif(apiSeed: any, token: string, type: string) {
  await expect
    .poll(
      async () =>
        ((await apiSeed.getNotifications(token)).data ?? []).some((n: any) => n.type === type),
      { timeout: 20_000 },
    )
    .toBe(true);
}

test('cloche notifs (athlète + coach), retour de nav, badge engagement', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Ux');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Ux');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');
  await apiSeed.grantConsent(athlete.token, 'coach_access');

  // Notif athlète (session_assigned) + notif coach (performance_submitted).
  const sessionId = await apiSeed.createSession(coach.token, { title: 'Sprint UX' });
  const [assignment] = await apiSeed.assign(coach.token, sessionId, {
    athleteIds: [athlete.id],
    dueDate: '2026-06-12',
  });
  await waitForNotif(apiSeed, athlete.token, 'session_assigned');
  await apiSeed.submitPerformance(athlete.token, assignment.id, { timeSeconds: 11.4 });
  await waitForNotif(apiSeed, coach.token, 'performance_submitted');

  // Compétition publiée + athlète engagé (badge d'engagement).
  const competitionId = await apiSeed.createCompetition(coach.token, { status: 'published' });
  await apiSeed.engageAthletes(coach.token, competitionId, [athlete.id], '100 m');

  await apiSeed.loginAs(page, athlete);
  await expect(page.getByTestId('home-greeting')).toBeVisible({ timeout: 20_000 });

  // --- 1a. Cloche athlète : badge visible → ouverture (sans read-all) → « Tout marquer lu » ---
  // TLX-189 : la simple ouverture du centre ne marque PLUS tout lu ; seul le geste explicite
  // le fait. Le badge doit donc survivre à un aller-retour, puis tomber sur « Tout marquer lu ».
  await expect(page.getByTestId('notifications-bell-badge')).toBeVisible();
  await page.screenshot({ path: 'e2e/__screens__/tlx-135-athlete-badge.png' });
  await page.getByTestId('notifications-bell').click();
  await expect(page.getByTestId('notifications-title')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid^="notification-"]').first()).toBeVisible();
  await page.getByTestId('notifications-back').click();
  await expect(page.getByTestId('home-greeting')).toBeVisible();
  await expect(page.getByTestId('notifications-bell-badge')).toBeVisible();

  // Geste explicite → badge à zéro (et le centre reste consultable ensuite).
  await page.getByTestId('notifications-bell').click();
  await page.getByTestId('notifications-read-all').click();
  await page.getByTestId('notifications-back').click();
  await expect(page.getByTestId('home-greeting')).toBeVisible();
  await expect(page.getByTestId('notifications-bell-badge')).toHaveCount(0, { timeout: 15_000 });

  // --- 2. Badge d'engagement athlète + retour de nav (TLX-92, `backBehavior="history"`) ---
  // Le parcours d'origine de cette section (Profil → « Centre de notifications » → retour)
  // n'existe plus : la refonte Profil a retiré cet accès au profit de la seule cloche
  // (`NotificationsLink` n'est plus monté nulle part). La règle TLX-92 — revenir d'une route
  // HORS tab bar ramène sur le DERNIER onglet visité, pas sur Accueil — reste vérifiable ici,
  // via la route « compétitions ». Depuis ADR-44 le calendrier n'est plus un onglet de la tab
  // bar athlète (Accueil · Séances · Progression · Groupe · Profil) : il est une vue de
  // l'onglet Séances, d'où le passage par le sous-onglet « Calendrier ».
  await page.getByRole('tab', { name: 'Séances' }).click();
  await page.getByRole('tab', { name: 'Calendrier' }).click();
  await page.getByTestId('calendar-competitions-link').click();
  await expect(page.getByTestId('entry-status-engaged').first()).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'e2e/__screens__/tlx-135-athlete-engagement.png', fullPage: true });

  // Retour depuis la route hors tab bar → on revient sur Séances (dernier onglet visité).
  await page.getByTestId('competitions-back').click();
  // Les écrans d'onglets restent montés (react-native-web) → onglet actif prouvé via aria-selected.
  await expect(page.getByRole('tab', { name: 'Séances' })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 15_000 },
  );
  await expect(page.getByRole('tab', { name: 'Accueil' })).toHaveAttribute(
    'aria-selected',
    'false',
  );

  // --- 1b. Cloche coach : badge visible → ouverture (sans read-all) → « Tout marquer lu » ---
  await apiSeed.loginAs(page, coach);
  await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('notifications-bell-badge')).toBeVisible();
  await page.getByTestId('notifications-bell').click();
  await expect(page.getByTestId('notifications-title')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('notifications-back').click();
  await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible();
  // TLX-189 : l'ouverture seule ne marque plus tout lu — le badge survit.
  await expect(page.getByTestId('notifications-bell-badge')).toBeVisible();
  await page.getByTestId('notifications-bell').click();
  await page.getByTestId('notifications-read-all').click();
  await page.getByTestId('notifications-back').click();
  await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible();
  await expect(page.getByTestId('notifications-bell-badge')).toHaveCount(0, { timeout: 15_000 });

  // --- 3b. Liste coach : statut de la compétition (publiée), pas d'engagement ---
  // ADR-53 : le calendrier coach est désormais sous l'onglet Séances (sous-onglet Calendrier).
  await page.getByRole('tab', { name: 'Séances' }).click();
  await page.getByRole('tab', { name: 'Calendrier' }).click();
  await page.getByTestId('calendar-competitions-link').click();
  await expect(page.getByTestId('competition-status-published').first()).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: 'e2e/__screens__/tlx-135-coach-competitions.png', fullPage: true });
});
