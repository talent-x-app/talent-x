import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';

/**
 * TLX-133 — Récurrence d'assignation (ADR-35, bloc « Répéter », C-06). Le coach assigne une séance
 * « chaque mardi jusqu'au … » → N occurrences datées ; la confirmation affiche « répétée N fois » et
 * l'athlète voit N affectations. Le bloc « Répéter » n'apparaît qu'avec une échéance valide.
 */

/**
 * Sélectionne une date via le `DatePicker` (TLX-197) : ouvre le calendrier puis avance de mois en
 * mois jusqu'à voir la cellule du jour cible, et la presse. Dates attendues ≥ mois courant.
 */
async function pickDate(page: Page, testID: string, iso: string) {
  await page.getByTestId(testID).click();
  const cell = page.getByTestId(`${testID}-cell-${iso}`);
  for (let i = 0; i < 18 && !(await cell.isVisible()); i++) {
    await page.getByTestId(`${testID}-next`).click();
  }
  await cell.click();
}

/** Prochain mardi **strictement** après aujourd'hui, en ISO local. */
function nextTuesday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() !== 2); // 2 = mardi
  return d;
}

function isoOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Dates **relatives à aujourd'hui** : le `DatePicker` n'avance que vers le futur, donc des dates
// en dur finissent immanquablement par sortir du domaine atteignable (ce spec était figé sur juin
// 2026). Premier mardi à venir, puis 3 semaines plus tard inclus → 4 occurrences hebdomadaires.
const OCCURRENCES = 4;
const DUE_DATE = nextTuesday();
const DUE = isoOf(DUE_DATE);
const UNTIL = isoOf(new Date(DUE_DATE.getTime() + (OCCURRENCES - 1) * 7 * 24 * 60 * 60 * 1000));

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
  await pickDate(page, 'assign-due-date', DUE);
  await expect(page.getByTestId('assign-repeat-toggle')).toBeVisible();

  await page.getByTestId('assign-repeat-toggle').click();
  await pickDate(page, 'assign-repeat-until', UNTIL);
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
