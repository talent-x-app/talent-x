import { test, expect } from './fixtures';

/**
 * TLX-221 — Vérification live du **centre de notifications** après TLX-189 (lecture unitaire).
 * Exige API + Redis + worker (le fan-out des annonces passe par la file).
 *
 * Le comportement livré par TLX-189 : ouvrir le centre ne marque plus tout lu
 * automatiquement (le pouls des annonces/réponses/kudos n'est plus effacé d'un coup) ; la
 * lecture se fait **au tap** sur une notification, et « Tout marquer lu » reste disponible
 * comme geste explicite.
 */
test('centre de notifications : pas de read-all à l’ouverture, lecture au tap, tout marquer lu', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Notif221');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Notif221');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);

  // Deux annonces de groupe → deux notifications `group_announcement` pour l'athlète membre.
  await apiSeed.createAnnouncement(coach.token, group.id, 'Séance de samedi déplacée à 10h.');
  await apiSeed.createAnnouncement(coach.token, group.id, 'Pensez aux pointes pour mardi.');
  await expect
    .poll(async () => (await apiSeed.getNotifications(athlete.token)).unreadCount, {
      timeout: 20_000,
    })
    .toBe(2);
  const feed = await apiSeed.getNotifications(athlete.token);
  const [first, second] = feed.data as Array<{ id: string }>;

  await apiSeed.loginAs(page, athlete);

  // `.filter({ visible: true })` : la cloche est portée par plusieurs écrans (accueil, hub de
  // groupe…) et les onglets déjà visités restent montés-gelés côté web (cf. TLX-222).
  const bell = () => page.getByTestId('notifications-bell').filter({ visible: true }).first();
  const badge = () =>
    page.getByTestId('notifications-bell-badge').filter({ visible: true }).first();

  // --- 1. Badge de non-lues visible sur l'accueil athlète. ---
  await expect(badge()).toBeVisible({ timeout: 20_000 });
  await expect(badge()).toHaveText('2');

  // --- 2. Ouverture du centre : le badge n'est PAS remis à zéro (cœur de TLX-189). ---
  await bell().click();
  await expect(page.getByTestId(`notification-${first.id}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`notification-${first.id}-unread`)).toBeVisible();
  await expect(page.getByTestId(`notification-${second.id}-unread`)).toBeVisible();
  // Le serveur confirme : rien n'a été marqué lu par la simple ouverture.
  expect((await apiSeed.getNotifications(athlete.token)).unreadCount).toBe(2);
  await page.screenshot({ path: 'e2e/__screens__/tlx-221-centre-ouvert.png', fullPage: true });

  // --- 3. Tap sur une notification → sa pastille disparaît, le compteur décrémente. ---
  await page.getByTestId(`notification-${first.id}`).click();
  await expect
    .poll(async () => (await apiSeed.getNotifications(athlete.token)).unreadCount, {
      timeout: 15_000,
    })
    .toBe(1);

  // Retour au centre (le tap navigue vers la ressource) : le badge affiche 1, la lue n'a plus
  // de pastille, l'autre si.
  await expect(badge()).toHaveText('1', { timeout: 15_000 });
  await bell().click();
  await expect(page.getByTestId(`notification-${second.id}-unread`)).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId(`notification-${first.id}-unread`)).toHaveCount(0);

  // --- 4. « Tout marquer lu » → plus aucune pastille, badge à zéro. ---
  await page.getByTestId('notifications-read-all').click();
  await expect(page.getByTestId(`notification-${second.id}-unread`)).toHaveCount(0, {
    timeout: 15_000,
  });
  expect((await apiSeed.getNotifications(athlete.token)).unreadCount).toBe(0);
  await page.screenshot({ path: 'e2e/__screens__/tlx-221-tout-lu.png', fullPage: true });

  await page.getByTestId('notifications-back').click();
  await expect(bell()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('notifications-bell-badge').filter({ visible: true })).toHaveCount(
    0,
  );
});
