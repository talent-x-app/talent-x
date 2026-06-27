import { test, expect } from './fixtures';

/**
 * E2E (ADR-54, TLX-209 — R17) — entrée unifiée de création : un **modèle** s'amorce désormais via le
 * **même sélecteur de discipline** qu'une séance. Parcours : login coach → entrée modèle
 * (`session/new?status=template`) → le picker s'affiche en « Nouveau modèle » → discipline Sprint →
 * assistant en **mode modèle** (pas de champ date, ADR-29) → enregistrement → retour bibliothèque de
 * modèles (un modèle n'est pas assignable). Cible Expo web ; seed via l'API (fixtures).
 */

test.use({ viewport: { width: 414, height: 1000 } });

test('créer un modèle via un assistant discipline (entrée unifiée R17)', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Modele', 'Coach');
  await apiSeed.loginAs(page, coach);

  // Entrée « modèle » → sélecteur de discipline (et non plus le constructeur brut).
  await apiSeed.gotoAuthed(page, '/session/new?status=template', 'new-session-title');
  await expect(page.getByTestId('new-session-title')).toHaveText('Nouveau modèle');

  // Même grammaire d'entrée : on choisit une discipline → assistant Sprint.
  await page.getByTestId('new-session-discipline-sprint').click();
  await expect(page.getByTestId('sprint-effort-canvas')).toBeVisible({ timeout: 20_000 });

  // Mode modèle : un modèle n'est pas daté → le champ date est absent (ADR-29).
  await expect(page.getByTestId('session-field-date')).toBeHidden();

  await page.getByTestId('session-field-title').fill('Modèle sprint E2E');
  await page.getByTestId('session-save').click();

  // Un modèle n'est pas assignable → retour à la bibliothèque de modèles (pas l'écran d'assignation).
  await expect(page.getByTestId('template-create')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('assign-title')).toHaveCount(0);
});
