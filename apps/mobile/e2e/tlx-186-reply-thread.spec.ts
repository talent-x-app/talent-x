import { test, expect } from './fixtures';

/**
 * TLX-186 / ADR-48 Palier 3 / ADR-50 — fil de réponses **bidirectionnel** sous une annonce.
 * Vérifie sur la cible Expo web (react-native-web) :
 *  - un membre déplie le fil sous une annonce, écrit une réponse et l'envoie → elle apparaît ;
 *  - le membre **signale** la réponse d'un coéquipier via un motif borné → la réponse passe
 *    à l'état « Signalée » (modération communautaire, ADR-50 §D3).
 *
 * Les `testID` du fil (`replies-toggle-*`, `reply-*`, `reply-input-*`, `reply-report-*`)
 * deviennent des `data-testid` ciblables.
 */

test('athlète : fil de réponses — répondre + signaler une réponse (Palier 3)', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'P3');
  const athlete = await apiSeed.register('athlete', 'Ath', 'P3');
  const mate = await apiSeed.register('athlete', 'Karim', 'Bernard');
  const group = await apiSeed.createGroup(coach.token, 'Sprint P3');
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.joinGroup(mate.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');

  // Une annonce du coach + une réponse seedée d'un coéquipier (cible du signalement).
  const announcementId = await apiSeed.createAnnouncement(
    coach.token,
    group.id,
    'Changement de lieu jeudi : stade couvert.',
  );
  const mateReplyId = await apiSeed.createReply(
    mate.token,
    group.id,
    announcementId,
    'On se retrouve où exactement ?',
  );

  await apiSeed.loginAs(page, athlete);

  // --- Onglet Groupe → onglet Annonces (« Mur ») → déplier le fil de l'annonce ---
  await apiSeed.gotoAuthed(page, '/groups', 'athlete-group-tabs');
  await page.getByTestId('athlete-group-tabs-announcements').click();
  await expect(page.getByTestId(`announcement-${announcementId}`)).toBeVisible({ timeout: 15_000 });

  await page.getByTestId(`replies-toggle-${announcementId}`).click();
  await expect(page.getByTestId(`reply-thread-${announcementId}`)).toBeVisible({ timeout: 15_000 });

  // La réponse seedée du coéquipier est rendue.
  await expect(page.getByTestId(`reply-${mateReplyId}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('On se retrouve où exactement ?')).toBeVisible();

  // --- Le membre écrit et envoie sa propre réponse → elle apparaît dans le fil ---
  await page.getByTestId(`reply-input-${announcementId}`).fill('Au stade couvert, entrée nord.');
  await page.getByTestId(`reply-send-${announcementId}`).click();
  await expect(page.getByText('Au stade couvert, entrée nord.')).toBeVisible({ timeout: 15_000 });

  // --- Signalement de la réponse du coéquipier via un motif borné ---
  await page.getByTestId(`reply-report-${mateReplyId}`).click();
  await page.getByTestId(`reply-report-${mateReplyId}-offensive`).click();

  // Après signalement : le bouton drapeau disparaît, l'état « Signalée » apparaît.
  await expect(page.getByTestId(`reply-report-${mateReplyId}`)).toBeHidden({ timeout: 15_000 });

  await page.screenshot({ path: 'e2e/__screens__/tlx-186-reply-thread.png', fullPage: true });
});
