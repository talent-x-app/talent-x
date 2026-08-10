import path from 'node:path';
import { test, expect } from './fixtures';

/**
 * E2E (ADR-39, TLX-166) — assistant Sprint avec la **carte d'effort dédiée** (TLX-165) :
 * login coach → « Nouvelle séance » → Sprint → édition de la carte de série → `POST /sessions`
 * réussi (navigation vers l'écran d'assignation) → **relecture du document sérialisé**.
 *
 * La carte suit le patron ADR-39 : **1 carte = 1 série** (`series-card-N`), les sprints étant
 * les lignes de son tableau (`series-card-N-sprint-M`). Les propriétés partagées de la série
 * (référentiel d'intensité, type de départ) sont portées par chaque sprint du groupe pour
 * garantir le round-trip C-05 sans perte (invariant ADR-38 §2). L'assistant amorce le modèle
 * « Départs / Accélération » : 3 sprints (20/30/40 m à 95 %), 3 tours, R 5′.
 *
 * Cible Expo web ; seed via l'API (fixtures).
 */

const SHOTS = process.env.CAPTURE_DIR ?? 'c:/tmp';

test.use({ viewport: { width: 414, height: 1000 } });

test('assistant Sprint : carte d’effort → création de séance', async ({ page, apiSeed }) => {
  const coach = await apiSeed.register('coach', 'Carte', 'Coach');
  await apiSeed.loginAs(page, coach);

  // « Nouvelle séance » → discipline Sprint → assistant avec la carte d'effort.
  await apiSeed.gotoAuthed(page, '/session/new', 'new-session-title');
  await page.getByTestId('new-session-discipline-sprint').click();
  await expect(page.getByTestId('sprint-effort-canvas')).toBeVisible({ timeout: 20_000 });

  // Amorce = modèle « Départs / Accélération » : une carte de série, 3 sprints, 3 tours.
  await expect(page.getByTestId('series-card-0')).toBeVisible();
  await expect(page.getByTestId('series-card-0-sprint-0-dist')).toHaveValue('20');
  await expect(page.getByTestId('series-card-0-rounds-value')).toHaveText('3');

  // Référentiel d'intensité : changer de mode **réinitialise** les valeurs (un « 95 » en % du
  // record n'a aucun sens en secondes — ADR-39 §5, la conversion dépend du record de l'athlète).
  await page.getByTestId('series-card-0-imode-target_time').click();
  await expect(page.getByTestId('series-card-0-sprint-0-int')).toHaveValue('');
  await page.getByTestId('series-card-0-imode-percent_record').click();

  // Édition de la 1re ligne du tableau : 60 m, 100 % du record, récup r 4′.
  await page.getByTestId('series-card-0-sprint-0-dist').fill('60');
  await page.getByTestId('series-card-0-sprint-0-int').fill('100');
  await page.getByTestId('series-card-0-sprint-0-rec').fill('4');

  // Propriétés de série : 2 tours, R 8′, départ debout.
  await page.getByTestId('series-card-0-rounds-dec').click();
  await expect(page.getByTestId('series-card-0-rounds-value')).toHaveText('2');
  await page.getByTestId('series-card-0-restR').fill('8');
  await page.getByTestId('series-card-0-start-standing').click();

  // Ajout d'un 4e sprint (recopie du dernier : 40 m).
  await page.getByTestId('series-card-0-add-sprint').click();
  await expect(page.getByTestId('series-card-0-sprint-3-dist')).toHaveValue('40');

  // Les deux résumés live reflètent l'édition (TLX-160) : celui de la série (phrase condensée)
  // et celui du canvas (volume haute intensité = 2 tours × (60 + 30 + 40 + 40) = 340 m).
  await expect(page.getByTestId('series-card-0-summary')).toHaveText(
    '2 × (60·30·40·40 m) · debout · 95→100% · R 8′',
  );
  await expect(page.getByTestId('sprint-canvas-summary')).toContainText('340 m');

  await page.getByTestId('session-field-title').fill('Carte sprint E2E');
  await page.screenshot({ path: path.join(SHOTS, 'sprint-card-live.png'), fullPage: true });

  // Enregistrer → création réussie → navigation vers l'écran d'assignation (C-06).
  await page.getByTestId('session-save').click();
  await expect(page.getByTestId('assign-title')).toBeVisible({ timeout: 20_000 });
  const sessionId = decodeURIComponent(page.url().match(/\/assign\/([^/?]+)/)![1]);

  // Relecture API : la carte sérialise un document `exercises` v3 **standard** — une série
  // (`kind: group`) encadrée d'un échauffement et d'un retour au calme, chaque sprint portant
  // les propriétés partagées de la série. C'est l'invariant ADR-38 §2 / ADR-39 décision 2 :
  // la séance produite par la carte reste éditable bloc par bloc en C-05 sans perte.
  const session = await apiSeed.getSession(coach.token, sessionId);
  expect(session.exercises.schemaVersion).toBe(3);
  const serie = session.exercises.items.find((n: any) => n.kind === 'group');
  expect(serie, 'aucune série sérialisée').toBeTruthy();
  expect(serie).toMatchObject({ rounds: 2, restBetweenRoundsSeconds: 480 });
  expect(serie.items.map((b: any) => b.type)).toEqual(['sprint', 'sprint', 'sprint', 'sprint']);
  expect(serie.items.map((b: any) => b.params.distanceMeters)).toEqual([60, 30, 40, 40]);
  expect(serie.items[0].params).toMatchObject({
    intensityMode: 'percent_record',
    intensityValue: 100,
    startType: 'standing',
    recoverySeconds: 240,
  });
  // Le départ est un param **partagé** : il est porté par tous les sprints de la série.
  expect(serie.items.every((b: any) => b.params.startType === 'standing')).toBe(true);
  // Échauffement / retour au calme encadrants (assistant standalone, ADR-39).
  const phases = session.exercises.items
    .filter((n: any) => n.kind !== 'group')
    .map((n: any) => n.type);
  expect(phases).toEqual(['warmup', 'cooldown']);
});
