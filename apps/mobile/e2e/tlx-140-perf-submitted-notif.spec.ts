import { test, expect } from './fixtures';

/**
 * TLX-140 — Round-trip end-to-end « performance à revoir » (TLX-139). Exige API + Redis + worker.
 *  - L'athlète soumet une perf → le coach reçoit une notif `performance_submitted` (badge).
 *  - Rejeu idempotent → pas de doublon (unicité dedupe_key).
 *  - Préférence `performanceSubmitted = false` → aucune notif.
 *  - Séance libre (coach = athlète) → aucune auto-notification.
 *  - Mobile : la notification ouvre la revue C-08 `/review/[id]`.
 */

async function waitNotif(apiSeed: any, token: string, type: string) {
  await expect
    .poll(
      async () =>
        ((await apiSeed.getNotifications(token)).data ?? []).some((n: any) => n.type === type),
      {
        timeout: 20_000,
      },
    )
    .toBe(true);
}

test('perf soumise → notif coach, idempotence, préférence, séance libre, navigation revue', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Notif');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Notif');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');

  const sessionId = await apiSeed.createSession(coach.token, { title: 'Sprint à revoir' });
  const [assignment] = await apiSeed.assign(coach.token, sessionId, {
    athleteIds: [athlete.id],
    dueDate: '2026-06-12',
  });

  // 1. Soumission → notif coach performance_submitted.
  await apiSeed.submitPerformance(athlete.token, assignment.id, { timeSeconds: 11.3 });
  await waitNotif(apiSeed, coach.token, 'performance_submitted');
  expect(await apiSeed.countNotifs(coach.token, 'performance_submitted')).toBe(1);

  // 2. Rejeu idempotent (même affectation) → toujours 1 (unicité dedupe_key).
  await apiSeed.submitPerformance(athlete.token, assignment.id, { timeSeconds: 11.3 });
  await page.waitForTimeout(3000);
  expect(await apiSeed.countNotifs(coach.token, 'performance_submitted')).toBe(1);

  // 3. Préférence performanceSubmitted = false → aucune notif (scénario isolé).
  const coach2 = await apiSeed.register('coach', 'Coach', 'Pref');
  const athlete2 = await apiSeed.register('athlete', 'Ath', 'Pref');
  const g2 = await apiSeed.createGroup(coach2.token);
  await apiSeed.joinGroup(athlete2.token, g2.inviteCode);
  await apiSeed.grantConsent(athlete2.token, 'data_processing');
  await apiSeed.setNotificationPref(coach2.token, 'performanceSubmitted', false);
  const s2 = await apiSeed.createSession(coach2.token, { title: 'Pref off' });
  const [a2] = await apiSeed.assign(coach2.token, s2, {
    athleteIds: [athlete2.id],
    dueDate: '2026-06-12',
  });
  await apiSeed.submitPerformance(athlete2.token, a2.id, { timeSeconds: 12.0 });
  await page.waitForTimeout(3000);
  expect(await apiSeed.countNotifs(coach2.token, 'performance_submitted')).toBe(0);

  // 4. Séance libre (coach = athlète) → aucune auto-notification.
  await apiSeed.logTraining(athlete.token, {
    type: 'sprint',
    distanceMeters: 200,
    timeSeconds: 24.0,
    date: '2026-06-01',
  });
  await page.waitForTimeout(3000);
  expect(await apiSeed.countNotifs(athlete.token, 'performance_submitted')).toBe(0);

  // 5. Mobile : la notification ouvre la revue C-08 /review/[id].
  await apiSeed.loginAs(page, coach);
  await expect(page.getByTestId('coach-dashboard-subtitle')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('notifications-bell').click(); // route partagée → nav client-side
  await expect(page.getByTestId('notifications-title')).toBeVisible({ timeout: 20_000 });
  await page.locator('[data-testid^="notification-"]').first().click();
  await expect(page).toHaveURL(/\/review\//, { timeout: 15_000 });
  await expect(page.getByTestId('review-title')).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'e2e/__screens__/tlx-140-coach-review.png', fullPage: true });
});
