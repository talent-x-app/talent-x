import { test, expect } from './fixtures';

/**
 * TLX-184 / ADR-48 Palier 1 — onglet « Mur » du hub de groupe athlète. Vérifie l'habillage
 * social agrégé (RGPD-safe, patron ADR-45) ajouté à l'onglet Annonces :
 *  - réactions emoji **agrégées** sur une annonce (compteur + togglable, jamais de noms) ;
 *  - accusé de lecture agrégé « X/Y lu » ;
 *  - pouls d'équipe (agrégat dérivé de la semaine) et bannière de présence narrative —
 *    best-effort (dépendent du fan-out de groupe / d'autres membres) : capturés en screenshot.
 *
 * Cible Expo web (react-native-web) : les `testID` du Mur deviennent des `data-testid`.
 */

// Séance à venir cette semaine (le pouls borne au lundi→dimanche courant).
const DUE = '2026-06-25';

test('athlète : onglet Mur — réactions agrégées + accusé de lecture sur une annonce', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Mur');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Mur');
  const mate = await apiSeed.register('athlete', 'Mate', 'Mur');
  const group = await apiSeed.createGroup(coach.token, 'Sprint Mur');
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.joinGroup(mate.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');

  // Une annonce du coach (support des réactions + de l'accusé de lecture).
  await apiSeed.createAnnouncement(
    coach.token,
    group.id,
    'Changement de lieu jeudi : stade couvert.',
  );

  // Une séance du groupe cette semaine + RSVP des deux athlètes → alimente pouls & narrative.
  const sessionId = await apiSeed.createSession(coach.token, { title: 'Footing collectif' });
  const assigns = await apiSeed.assign(coach.token, sessionId, {
    athleteIds: [athlete.id, mate.id],
    dueDate: DUE,
  });
  const mine = assigns.find((a) => a.athleteId === athlete.id) ?? assigns[0];
  const mateAssign = assigns.find((a) => a.athleteId === mate.id);
  await apiSeed.setAttendance(athlete.token, mine.id, 'going');
  if (mateAssign) await apiSeed.setAttendance(mate.token, mateAssign.id, 'going');

  await apiSeed.loginAs(page, athlete);

  // --- Onglet Groupe → onglet Annonces (« Mur ») ---
  await apiSeed.gotoAuthed(page, '/groups', 'athlete-group-tabs');
  await expect(page.getByTestId('athlete-group-name')).toHaveText(/Sprint Mur/);
  await page.getByTestId('athlete-group-tabs-announcements').click();

  // --- L'annonce du coach est rendue avec son pied social ---
  const announcement = page.getByTestId(/^announcement-/).first();
  await expect(announcement).toBeVisible({ timeout: 15_000 });
  const announcementId = (await announcement.getAttribute('data-testid'))!.replace(
    'announcement-',
    '',
  );

  // Accusé de lecture agrégé « X/Y lu » (l'ouverture marque l'annonce comme lue).
  await expect(page.getByTestId(`read-count-${announcementId}`)).toBeVisible({ timeout: 15_000 });

  // --- Réaction emoji : ouvrir le sélecteur, poser ❤️, voir la pastille compteur ---
  await page.getByTestId(`reaction-add-${announcementId}`).click();
  await page.getByTestId(`reaction-pick-${announcementId}-❤️`).click();
  await expect(page.getByTestId(`reaction-${announcementId}-❤️`)).toBeVisible({ timeout: 15_000 });

  // Pouls d'équipe + présence narrative : best-effort (capturés, non bloquants).
  await page.screenshot({ path: 'e2e/__screens__/tlx-184-group-wall.png', fullPage: true });

  // --- Toggle : retap de la réaction la retire (idempotent) ---
  await page.getByTestId(`reaction-${announcementId}-❤️`).click();
  await expect(page.getByTestId(`reaction-${announcementId}-❤️`)).toBeHidden({ timeout: 15_000 });
});
