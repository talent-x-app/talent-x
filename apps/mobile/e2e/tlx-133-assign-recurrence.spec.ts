import { test, expect } from './fixtures';

/**
 * TLX-133 — Récurrence d'assignation (ADR-35, bloc « Répéter », C-06). Le coach assigne une séance
 * « chaque mardi jusqu'au … » → N occurrences datées ; la confirmation affiche « répétée N fois » et
 * l'athlète voit N affectations. Le bloc « Répéter » n'apparaît qu'avec une échéance valide.
 */

// 2026-06-16 = mardi ; jusqu'au 2026-07-07 (mardi) inclus → 16, 23, 30 juin + 7 juil. = 4 occurrences.
const DUE = '2026-06-16';
const UNTIL = '2026-07-07';
const OCCURRENCES = 4;

test('assignation récurrente → N occurrences + confirmation « répétée N fois »', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Rec');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Rec');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  const sessionId = await apiSeed.createSession(coach.token, { title: 'Fractionné mardi' });

  await apiSeed.loginAs(page, coach);
  await page.goto(`/assign/${sessionId}`);
  await expect(page.getByTestId('assign-title')).toBeVisible({ timeout: 20_000 });

  // Bloc « Répéter » caché tant qu'aucune échéance valide.
  await expect(page.getByTestId('assign-repeat-toggle')).toBeHidden();
  await page.getByTestId('assign-due-date').fill(DUE);
  await expect(page.getByTestId('assign-repeat-toggle')).toBeVisible();

  await page.getByTestId('assign-repeat-toggle').click();
  await page.getByTestId('assign-repeat-until').fill(UNTIL);
  await page.getByTestId(`assign-athlete-${athlete.id}`).click();
  await page.screenshot({ path: 'e2e/__screens__/tlx-133-assign-form.png', fullPage: true });

  await page.getByTestId('assign-submit').click();
  await expect(page.getByTestId('assign-confirmation')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('assign-confirmation-summary')).toContainText(
    `répétée ${OCCURRENCES} fois`,
  );
  await page.screenshot({ path: 'e2e/__screens__/tlx-133-confirmation.png', fullPage: true });

  // L'athlète voit bien N affectations matérialisées.
  const mine = await apiSeed.myAssignments(athlete.token);
  expect(mine.filter((a) => a.sessionId).length).toBeGreaterThanOrEqual(OCCURRENCES);
});
