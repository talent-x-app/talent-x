import { test, expect } from './fixtures';

/**
 * TLX-86 — Vérification live Expo : grille de barres (sauts verticaux, ADR-25 / TLX-075).
 * Parcours bout-en-bout contre la **vraie** base (enum `vertical_jumps`, RS256, seed REST) :
 *
 *  1. Le **coach construit via l'UI** une séance Hauteur (départ 165 cm, +5 cm, 6 barres)
 *     → relecture API : `params {discipline, startHeightCm, incrementCm, bars}`, doc typé (≥ v2).
 *  2. Affectation à l'athlète (API).
 *  3. Athlète : détail séance → **grille pré-remplie** 1.65→1.90, dimensionnée sur les barres
 *     planifiées (TLX-223) → cycle d'essais (O/X) → `setResults` v2 exacts relus en base.
 *  4. **Record** : confirmation `vertical:high` (max franchi = 1.80 m) ; perche → `vertical:pole`
 *     **distinct**, **aucune collision** avec une longueur (`jumps:*`).
 *  5. Revue coach (C-08) : mesures lisibles, dont la barre manquée « 1.85 m ✗ ».
 *  6. Réhydratation : ré-ouverture de la saisie → grille regroupée par hauteur (essais restaurés).
 *
 * Côté coach, le parcours suit le **canevas à cartes d'effort** (ADR-39, généralisé aux 6
 * disciplines par TLX-167) : l'ancien éditeur de blocs plat (`block-0-type-*`) n'existe plus
 * en création. Le saut en hauteur s'atteint par l'assistant **Sauts**, dont le **Modèle**
 * « Hauteur » bascule la carte en éditeur vertical — il n'y a volontairement plus de sélecteur
 * de discipline séparé (`jumps-effort-card.tsx` : « la discipline est portée par le Modèle »).
 */

/** Feuilles d'un doc `exercises` v3, groupes traversés (ADR-27) — le canevas sérialise en séries. */
function leaves(items: any[]): any[] {
  return (items ?? []).flatMap((n) => (Array.isArray(n?.items) ? n.items : [n]));
}

test('grille de barres : coach Hauteur → athlète saisie → record vertical:high → revue coach', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Bars');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Bars');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');
  await apiSeed.grantConsent(athlete.token, 'coach_access');

  // --- 1. Le coach construit la séance Hauteur via l'assistant Sauts (UI) -----------------
  await apiSeed.loginAs(page, coach);
  await apiSeed.gotoAuthed(page, '/session/new', 'new-session-title');
  await page.getByTestId('new-session-discipline-jumps').click();
  await expect(page.getByTestId('jumps-effort-canvas')).toBeVisible({ timeout: 20_000 });

  // Modèle « Hauteur » → la carte quitte l'éditeur horizontal (élan/essais) pour l'éditeur
  // vertical (barre de départ / montée / nb de barres), pré-rempli à 165 cm + 5 cm.
  await page.getByTestId('series-card-0-preset').click();
  await page.getByTestId('series-card-0-preset-high').click();
  await expect(page.getByTestId('series-card-0-startHeight')).toHaveValue('165');
  await expect(page.getByTestId('series-card-0-increment')).toHaveValue('5');

  // Le modèle planifie 6 barres : la grille prévisualisée par le coach va de 165 à 190 cm.
  await expect(page.getByTestId('series-card-0-bars')).toHaveValue('6');
  await expect(page.getByTestId('series-card-0-bar-0')).toContainText('165 cm');
  await expect(page.getByTestId('series-card-0-bar-5')).toContainText('190 cm');
  await expect(page.getByTestId('series-card-0-bar-6')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/__screens__/tlx-86-coach-bar-grid.png', fullPage: true });

  await page.getByTestId('session-field-title').fill('Saut en hauteur');
  await page.getByTestId('session-status-published').click();
  await page.getByTestId('session-save').click();
  // Création d'une séance → enchaîne sur l'assignation (C-06) : l'URL porte le nouvel id.
  await page.waitForURL(/\/assign\//, { timeout: 20_000 });
  const sessionId = decodeURIComponent(page.url().match(/\/assign\/([^/?]+)/)![1]);

  // Relecture API : params persistés (la carte a bien sérialisé discipline + barres).
  const session = await apiSeed.getSession(coach.token, sessionId);
  expect(session.exercises.schemaVersion).toBeGreaterThanOrEqual(2); // doc exercises typé (≥ v2)
  const block = leaves(session.exercises.items).find((b) => b.type === 'vertical_jumps');
  expect(block, 'aucune feuille vertical_jumps sérialisée').toBeTruthy();
  expect(block.params).toMatchObject({
    discipline: 'high',
    startHeightCm: 165,
    incrementCm: 5,
    bars: 6,
  });

  // --- 2. Affectation à l'athlète (API) --------------------------------------------------
  const [assignment] = await apiSeed.assign(coach.token, sessionId, {
    athleteIds: [athlete.id],
    dueDate: '2026-06-14',
  });

  // --- 3. Athlète : grille pré-remplie → cycle d'essais → soumission ---------------------
  await apiSeed.loginAs(page, athlete);
  await apiSeed.gotoAuthed(page, `/session/${assignment.id}`, 'session-detail-title');
  await page.getByTestId('start-perf-entry').click();

  // Grille pré-remplie depuis départ 165 + montée 5, dimensionnée sur les **6 barres**
  // planifiées par le coach (TLX-223 : `params.bars` était ignoré, l'athlète en recevait
  // toujours 5 — le coach voyait 165→190, l'athlète 165→185).
  await expect(page.getByTestId('exercise-0-bar-0-height')).toHaveValue('1.65');
  await expect(page.getByTestId('exercise-0-bar-4-height')).toHaveValue('1.85');
  await expect(page.getByTestId('exercise-0-bar-5-height')).toHaveValue('1.9');
  await expect(page.getByTestId('exercise-0-bar-6-height')).toHaveCount(0);

  // Cycle d'essai au tap : – → O (franchi) → X (échec). On franchit 1.65→1.80, on manque 1.85.
  for (const j of [0, 1, 2, 3]) {
    await page.getByTestId(`exercise-0-bar-${j}-attempt-0`).click(); // none → cleared (O)
  }
  await page.getByTestId('exercise-0-bar-4-attempt-0').click(); // none → cleared
  await page.getByTestId('exercise-0-bar-4-attempt-0').click(); // cleared → failed (X)
  await page.screenshot({ path: 'e2e/__screens__/tlx-86-athlete-bar-grid.png', fullPage: true });

  await page.getByTestId('submit-performance').click();

  // Écran de confirmation (PerfConfirmationScreen) : candidat record + mesures lisibles.
  await expect(page.getByTestId('perf-confirmation-title')).toBeVisible({ timeout: 20_000 });
  // Le candidat porte la **barre franchie** la plus haute (1.80), pas la barre manquée (1.85).
  await expect(page.getByTestId('record-candidate-vertical:high')).toContainText('1.8 m');
  await expect(page.getByTestId('perf-confirmation-measures-0')).toContainText('1.85 m ✗');
  await page.screenshot({
    path: 'e2e/__screens__/tlx-86-athlete-confirmation.png',
    fullPage: true,
  });

  // Relecture en base : un set par essai tenté, hauteur portée même par l'échec (1.85 failed).
  const perf = await apiSeed.getPerformance(athlete.token, assignment.id);
  const sets = perf.results.items[0].setResults as Array<{
    distanceMeters?: number;
    failed?: boolean;
  }>;
  expect(sets.map((s) => s.distanceMeters)).toEqual([1.65, 1.7, 1.75, 1.8, 1.85]);
  expect(sets[4].failed).toBe(true);
  expect(sets.slice(0, 4).every((s) => !s.failed)).toBe(true);

  // --- 4. Record vertical:high confirmé **via l'UI** (max franchi = 1.80 m) ---------------
  await page.getByTestId('record-confirm-vertical:high').click();
  await expect(page.getByTestId('record-confirmed-vertical:high')).toBeVisible({ timeout: 15_000 });
  let records = await apiSeed.getRecords(athlete.token);
  const high = records.find((r) => r.eventKey === 'vertical:high');
  expect(high, 'record vertical:high absent').toBeTruthy();
  expect(high!.value).toBe(1.8);
  expect(high!.unit).toBe('m');

  // Perche → épreuve distincte `vertical:pole` ; aucune collision avec une longueur (`jumps:*`).
  const pole = await apiSeed.createVerticalSession(coach.token, {
    discipline: 'pole',
    startHeightCm: 350,
    incrementCm: 20,
    title: 'Saut à la perche',
  });
  const [poleAssignment] = await apiSeed.assign(coach.token, pole.sessionId, {
    athleteIds: [athlete.id],
    dueDate: '2026-06-14',
  });
  const polePerf = await apiSeed.submitBars(athlete.token, poleAssignment.id, {
    exerciseName: pole.exerciseName,
    bars: [
      { height: 3.5, attempts: ['cleared'] },
      { height: 3.7, attempts: ['cleared'] },
      { height: 3.9, attempts: ['failed'] },
    ],
  });
  await apiSeed.confirmRecord(athlete.token, 'vertical:pole', polePerf.id);
  records = await apiSeed.getRecords(athlete.token);
  const poleRec = records.find((r) => r.eventKey === 'vertical:pole');
  expect(poleRec, 'record vertical:pole absent').toBeTruthy();
  expect(poleRec!.value).toBe(3.7);
  // Hauteur et perche sont des épreuves distinctes ; rien n'est classé en longueur.
  expect(poleRec!.eventKey).not.toBe(high!.eventKey);
  expect(records.some((r) => r.eventKey.startsWith('jumps:'))).toBe(false);

  // --- 5. Revue coach (C-08) : mesures lisibles, barre manquée « 1.85 m ✗ » --------------
  await apiSeed.loginAs(page, coach);
  await apiSeed.gotoAuthed(page, `/review/${assignment.id}`, 'review-title');
  const measures = page.getByTestId('review-measures-0');
  await expect(measures).toBeVisible({ timeout: 20_000 });
  await expect(measures).toContainText('1.85 m ✗');
  await expect(measures).toContainText('1.8 m');
  await page.screenshot({ path: 'e2e/__screens__/tlx-86-coach-review.png', fullPage: true });

  // --- 6. Réhydratation : ré-ouverture de la saisie → grille regroupée par hauteur --------
  await apiSeed.loginAs(page, athlete);
  await apiSeed.gotoAuthed(page, `/session/${assignment.id}`, 'session-detail-title');
  await page.getByTestId('start-perf-entry').click(); // « Modifier ma performance »
  // Les essais sont regroupés par hauteur : une ligne par barre saisie, hauteur restaurée.
  await expect(page.getByTestId('exercise-0-bar-0-height')).toHaveValue('1.65');
  await expect(page.getByTestId('exercise-0-bar-4-height')).toHaveValue('1.85');
  // La barre manquée (1.85) restaure son essai en échec (symbole « X »).
  await expect(page.getByTestId('exercise-0-bar-4-attempt-0')).toContainText('X');
});
