import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';

/**
 * TLX-85 — Vérification live du parcours COACH compétitions (TLX-101, ADR-24), le pendant
 * coach du parcours athlète déjà validé : calendrier → « Gérer les compétitions » → création
 * (constructeur) → enchaînement automatique sur l'engagement (route imbriquée
 * `competition/[id]/engage`) → sélection multi-athlètes + épreuve → confirmation → entrée
 * « Compétition » dans le calendrier coach → réouverture en édition → modification → suppression.
 */

/**
 * Sélectionne une date via le `DatePicker` (TLX-197) : ouvre le calendrier puis avance de mois
 * en mois jusqu'à voir la cellule du jour cible, et la presse. Dates attendues ≥ mois courant.
 */
async function pickDate(page: Page, testID: string, iso: string) {
  await page.getByTestId(testID).click();
  const cell = page.getByTestId(`${testID}-cell-${iso}`);
  for (let i = 0; i < 18 && !(await cell.isVisible()); i++) {
    await page.getByTestId(`${testID}-next`).click();
  }
  await cell.click();
}

/** Aujourd'hui en ISO local (le calendrier coach sélectionne ce jour par défaut). */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

test('parcours coach : création → engagement multi-athlètes → calendrier → édition → suppression', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Compet');
  const athleteA = await apiSeed.register('athlete', 'Aline', 'Compet');
  const athleteB = await apiSeed.register('athlete', 'Bruno', 'Compet');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athleteA.token, group.inviteCode);
  await apiSeed.joinGroup(athleteB.token, group.inviteCode);

  await apiSeed.loginAs(page, coach);

  // --- 1. Calendrier coach (ADR-53 : sous l'onglet Séances) → « Gérer les compétitions ». ---
  await page.getByRole('tab', { name: 'Séances' }).click();
  await page.getByRole('tab', { name: 'Calendrier' }).click();
  await page.getByTestId('calendar-competitions-link').click();
  await expect(page.getByTestId('competitions-empty')).toBeVisible({ timeout: 20_000 });

  // --- 2. « + Nouvelle compétition » → constructeur → création (publiée, datée aujourd'hui). ---
  await page.getByTestId('competition-create').click();
  await expect(page.getByTestId('competition-builder-title')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('competition-field-name').fill('Meeting E2E de juillet');
  await page.getByTestId('competition-field-discipline').fill('Sprint');
  await page.getByTestId('competition-field-location').fill('Stade Charléty, Paris');
  await pickDate(page, 'competition-field-start', todayIso());
  await page.getByTestId('competition-status-published').click();
  await page.getByTestId('competition-save').click();

  // --- 3. Enchaînement automatique sur l'engagement (route imbriquée). ---
  await expect(page.getByTestId('engage-title')).toBeVisible({ timeout: 20_000 });
  const competitionId = /competition\/([^/]+)\/engage/.exec(page.url())?.[1];
  expect(competitionId, `id introuvable dans l'URL: ${page.url()}`).toBeTruthy();
  await expect(page.getByTestId('engage-competition-name')).toContainText('Meeting E2E');

  // Sélection multi-athlètes + épreuve commune → engagement → écran de confirmation.
  await page.getByTestId('engage-event-label').fill('100m');
  await page.getByTestId(`engage-athlete-${athleteA.id}`).click();
  await page.getByTestId(`engage-athlete-${athleteB.id}`).click();
  await page.getByTestId('engage-submit').click();
  await expect(page.getByTestId('engage-confirmation')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('engage-confirmation-summary')).toContainText('2');
  await page.screenshot({
    path: 'e2e/__screens__/tlx-85-engage-confirmation.png',
    fullPage: true,
  });

  // --- 4. Terminer → retour liste (le `replace` post-création court-circuite le formulaire). ---
  await page.getByTestId('engage-done').click();
  const listItem = page.getByTestId(`competition-item-${competitionId}`);
  await expect(listItem).toBeVisible({ timeout: 20_000 });
  // Scopé à la ligne : le chip « Publiée » du constructeur (écran resté monté) matche aussi.
  await expect(listItem.getByTestId('competition-status-published')).toBeVisible();

  // --- 5. Entrée « Compétition » dans le calendrier coach (tonalité dédiée) → ouvre l'édition. ---
  // TLX-222 corrigé : `enableScreens()` gèle désormais correctement les onglets masqués côté web
  // (display:none plutôt qu'un pointerEvents contournable par les boutons enfants) → plus de
  // calque fantôme cliquable, plus besoin du rechargement complet. Les onglets déjà visités
  // (ex. le constructeur en mode création) restent montés-gelés en arrière-plan (comportement
  // natif normal) : les sélecteurs ci-dessous filtrent donc sur `visible: true` quand un même
  // testID existe aussi, gelé, dans un autre onglet déjà visité.
  await page.getByRole('tab', { name: 'Séances' }).click();
  await page.getByRole('tab', { name: 'Calendrier' }).click();
  await expect(page.getByTestId(`calendar-entry-${competitionId}`)).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: 'e2e/__screens__/tlx-85-coach-calendar.png', fullPage: true });
  await page.getByTestId(`calendar-entry-${competitionId}`).click();

  // --- 6. Édition : formulaire hydraté → renommage → enregistrer. ---
  // `.filter({ visible: true })` : le constructeur en mode création (étape 2) reste monté-gelé
  // sous l'onglet `competition/new`, et partage les mêmes testID que l'écran d'édition courant.
  const editTitle = page.getByTestId('competition-builder-title').filter({ visible: true });
  await expect(editTitle).toBeVisible({ timeout: 15_000 });
  await expect(editTitle).toHaveText('Modifier la compétition');
  const editName = page.getByTestId('competition-field-name').filter({ visible: true });
  await expect(editName).toHaveValue('Meeting E2E de juillet');
  await editName.fill('Meeting E2E renommé');
  await page.getByTestId('competition-save').filter({ visible: true }).click();

  // Retour calendrier (provenance), puis liste : le nouveau nom est visible.
  await expect(page.getByTestId('calendar-competitions-link')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('calendar-competitions-link').click();
  await expect(page.getByTestId(`competition-item-${competitionId}`)).toContainText(
    'Meeting E2E renommé',
    { timeout: 20_000 },
  );

  // --- 7. Suppression (soft-delete) depuis l'édition → liste vide. ---
  await page.getByTestId(`competition-item-${competitionId}`).click();
  await expect(page.getByTestId('competition-builder-title').filter({ visible: true })).toBeVisible(
    { timeout: 15_000 },
  );
  await page.getByTestId('competition-delete').filter({ visible: true }).click();
  await expect(page.getByTestId('competitions-empty')).toBeVisible({ timeout: 20_000 });
});
