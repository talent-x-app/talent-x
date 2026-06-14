import { test, expect } from './fixtures';

/**
 * TLX-134 — Smoke Expo web : photo de profil (avatar, A-10/C-11), suivi TLX-124.
 *
 * Vérifie le parcours réel en navigateur (ce que les tests RTL ne couvrent pas) :
 *  - le sélecteur d'image `expo-image-picker` s'ouvre sur web (input fichier) ;
 *  - choix d'une image → upload présigné (POST presign → PUT MinIO → confirm) → l'avatar
 *    photo s'affiche (et non plus les initiales) ;
 *  - « Supprimer » → retour aux initiales.
 *
 * Capture les erreurs console + requêtes réseau échouées : le point de risque connu est
 * le PUT présigné depuis le navigateur (origin :8081) vers MinIO (:9000) — CORS.
 */

// PNG 1x1 valide (transparent) — suffit aux bornes serveur (content-type image/*, taille << 5 Mo).
const PNG_1x1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==';

test('avatar : picker web → upload présigné → affichage photo → suppression', async ({
  page,
  apiSeed,
}) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const presignedImageHits: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? '?'}`);
  });
  // Le chargement de l'avatar affiché tape une URL présignée S3 (lecture) → preuve du présigné.
  page.on('request', (req) => {
    if (/X-Amz-Signature/i.test(req.url()) && /9000|amazonaws|minio/i.test(req.url())) {
      presignedImageHits.push(`${req.method()} ${req.url().split('?')[0]}`);
    }
  });

  const athlete = await apiSeed.register('athlete', 'Ava', 'Tar');
  await apiSeed.grantConsent(athlete.token, 'data_processing');

  await apiSeed.loginAs(page, athlete);
  await page.getByRole('tab', { name: 'Profil' }).click();
  await expect(page.getByTestId('profile-name')).toBeVisible({ timeout: 20_000 });

  // État initial : initiales, pas de photo.
  await expect(page.getByTestId('profile-initials')).toBeVisible();
  await expect(page.getByTestId('profile-photo')).toHaveCount(0);

  // --- Sélecteur d'image (expo-image-picker web crée un <input type=file> et le clique) ---
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15_000 }),
    page.getByTestId('profile-avatar-change').click(),
  ]);
  await chooser.setFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_1x1_BASE64, 'base64'),
  });

  // --- L'avatar photo s'affiche (presign → PUT MinIO → confirm → photoUrl signé) ---
  // Si le PUT MinIO est bloqué (CORS), la photo n'apparaîtra pas → on rapporte les erreurs réseau.
  await expect(page.getByTestId('profile-photo')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId('profile-initials')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/__screens__/tlx-134-avatar-uploaded.png' });

  // L'image rendue a été chargée depuis une URL présignée S3 (PUT upload + GET lecture).
  expect(
    presignedImageHits.length,
    `aucune requête présignée S3 observée (PUT/GET avatar). Hits=${JSON.stringify(presignedImageHits)}`,
  ).toBeGreaterThan(0);

  // --- Suppression → retour aux initiales ---
  await page.getByTestId('profile-avatar-remove').click();
  await expect(page.getByTestId('profile-initials')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('profile-photo')).toHaveCount(0);
  await page.screenshot({ path: 'e2e/__screens__/tlx-134-avatar-removed.png' });

  // Diagnostic : aucune *vraie* panne réseau (CORS / connexion / DNS). On exclut
  // `net::ERR_ABORTED`, faux positif quand fetch ne draine pas le corps de la réponse
  // (uploadAvatar/deleteAvatar ne lisent que .ok/.status) — le statut HTTP est bien reçu,
  // ce que prouvent l'affichage de la photo (PUT OK) puis le retour aux initiales (DELETE OK).
  const hardFailures = failedRequests.filter(
    (r) => /9000|avatar|amazonaws|minio/i.test(r) && !/ERR_ABORTED/i.test(r),
  );
  expect(hardFailures, `pannes réseau bloquantes:\n${hardFailures.join('\n')}`).toEqual([]);
  // Aucune erreur console de type CORS.
  expect(
    consoleErrors.filter((e) => /CORS|Cross-Origin/i.test(e)),
    'erreurs CORS console',
  ).toEqual([]);
});
