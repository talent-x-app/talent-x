import { test, expect } from './fixtures';

/**
 * TLX-86 — Vérification live Expo : grille de barres (sauts verticaux, ADR-25 / TLX-075).
 * Parcours bout-en-bout contre la **vraie** base (enum `vertical_jumps`, RS256, seed REST) :
 *
 *  1. Le **coach construit via l'UI** une séance Hauteur (discipline=high, départ 165 cm, +5 cm)
 *     → relecture API : `params {discipline, startHeightCm, incrementCm}`, `schemaVersion 2`.
 *  2. Affectation à l'athlète (API).
 *  3. Athlète : détail séance → **grille pré-remplie** 1.65→1.85 → cycle d'essais (O/X) →
 *     soumission → `setResults` v2 exacts relus en base.
 *  4. **Record** : confirmation `vertical:high` (max franchi = 1.80 m) ; perche → `vertical:pole`
 *     **distinct**, **aucune collision** avec une longueur (`jumps:*`).
 *  5. Revue coach (C-08) : mesures lisibles, dont la barre manquée « 1.85 m ✗ ».
 *  6. Réhydratation : ré-ouverture de la saisie → grille regroupée par hauteur (essais restaurés).
 */

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

  // --- 1. Le coach construit la séance Hauteur via le constructeur (UI) -------------------
  await apiSeed.loginAs(page, coach);
  // `/session/new` affiche désormais le choix de discipline (ADR-38) ; `mode=custom` va
  // directement au constructeur générique (option « Personnalisé »).
  await page.goto('/session/new?mode=custom');
  await expect(page.getByTestId('session-builder-title')).toBeVisible({ timeout: 20_000 });

  await page.getByTestId('session-field-title').fill('Saut en hauteur');
  await page.getByTestId('session-status-published').click();
  // Le bloc 0 existe déjà (formulaire vierge) : on lui donne le type sauts verticaux.
  await page.getByTestId('block-0-type-vertical_jumps').click();
  await expect(page.getByTestId('block-0-params')).toBeVisible();
  await page.getByTestId('block-0-name').fill('Hauteur');
  await page.getByTestId('block-0-param-discipline-high').click();
  await page.getByTestId('block-0-param-startHeightCm').fill('165');
  await page.getByTestId('block-0-param-incrementCm').fill('5');

  await page.getByTestId('session-save').click();
  // Création d'une séance → enchaîne sur l'assignation (C-06) : l'URL porte le nouvel id.
  await page.waitForURL(/\/assign\//, { timeout: 20_000 });
  const sessionId = decodeURIComponent(page.url().match(/\/assign\/([^/?]+)/)![1]);

  // Relecture API : params persistés en v2 (le builder a bien sérialisé discipline + barres).
  const session = await apiSeed.getSession(coach.token, sessionId);
  expect(session.exercises.schemaVersion).toBeGreaterThanOrEqual(2); // doc exercises typé (≥ v2)
  const block = session.exercises.items[0];
  expect(block.type).toBe('vertical_jumps');
  expect(block.params).toMatchObject({ discipline: 'high', startHeightCm: 165, incrementCm: 5 });

  // --- 2. Affectation à l'athlète (API) --------------------------------------------------
  const [assignment] = await apiSeed.assign(coach.token, sessionId, {
    athleteIds: [athlete.id],
    dueDate: '2026-06-14',
  });

  // --- 3. Athlète : grille pré-remplie → cycle d'essais → soumission ---------------------
  await apiSeed.loginAs(page, athlete);
  await apiSeed.gotoAuthed(page, `/session/${assignment.id}`, 'session-detail-title');
  await page.getByTestId('start-perf-entry').click();

  // Grille pré-remplie depuis départ 165 + montée 5 (5 barres : 1.65 → 1.85).
  await expect(page.getByTestId('exercise-0-bar-0-height')).toHaveValue('1.65');
  await expect(page.getByTestId('exercise-0-bar-4-height')).toHaveValue('1.85');

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
