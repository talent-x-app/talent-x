import { test, expect } from './fixtures';

/**
 * TLX-185 / ADR-48 Palier 2 / ADR-49 — réactions **nominatives** + **kudos** de participation.
 * Vérifie sur la cible Expo web (react-native-web) :
 *  - D1 : un coéquipier réagit à une annonce → l'athlète voit son **prénom** sous la réaction
 *    (identité minimisée, AIPD TX-DPIA-007 §5.5) ;
 *  - D2 : sur une séance de groupe, l'athlète voit un coéquipier ayant **confirmé** sa présence
 *    et lui pose un **kudos 👏 togglable** (AIPD §5.6).
 */

const DUE = '2026-06-25';

test('athlète : réactions nominatives + kudos de présence (Palier 2)', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'P2');
  const athlete = await apiSeed.register('athlete', 'Ath', 'P2');
  const mate = await apiSeed.register('athlete', 'Léa', 'Bernard');
  const group = await apiSeed.createGroup(coach.token, 'Sprint P2');
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  await apiSeed.joinGroup(mate.token, group.inviteCode);
  await apiSeed.grantConsent(athlete.token, 'data_processing');

  // --- D1 : une annonce + un coéquipier (Léa) qui réagit ❤️ (auteur nominatif) ---
  const announcementId = await apiSeed.createAnnouncement(
    coach.token,
    group.id,
    'Changement de lieu jeudi : stade couvert.',
  );
  await apiSeed.addAnnouncementReaction(mate.token, group.id, announcementId, '❤️');

  // --- Séance affectée au GROUPE (provenance groupAssignmentId, ADR-30) cette semaine +
  //     présences « going » des deux athlètes : requis pour la visibilité de présence (D2) ---
  const sessionId = await apiSeed.createSession(coach.token, { title: 'Footing collectif' });
  const assigns = await apiSeed.assign(coach.token, sessionId, {
    groupIds: [group.id],
    dueDate: DUE,
  });
  const mine = assigns.find((a) => a.athleteId === athlete.id) ?? assigns[0];
  const mateAssign = assigns.find((a) => a.athleteId === mate.id)!;
  await apiSeed.setAttendance(athlete.token, mine.id, 'going');
  await apiSeed.setAttendance(mate.token, mateAssign.id, 'going');

  await apiSeed.loginAs(page, athlete);

  // === D1 : prénom de l'auteur sous la réaction (onglet Mur) ===
  await apiSeed.gotoAuthed(page, '/groups', 'athlete-group-tabs');
  await page.getByTestId('athlete-group-tabs-announcements').click();
  await expect(page.getByTestId(`reactors-names-${announcementId}-❤️`)).toContainText('Léa', {
    timeout: 15_000,
  });

  // === D2 : kudos sur la présence confirmée de Léa (détail de la séance) ===
  await apiSeed.gotoAuthed(page, `/session/${mine.id}`, 'presence-control');
  const kudosBtn = page.getByTestId(`kudos-${mateAssign.id}`);
  await expect(page.getByTestId(`teammate-going-${mateAssign.id}`)).toBeVisible({
    timeout: 15_000,
  });

  // Pose le kudos → compteur 1.
  await kudosBtn.click();
  await expect(page.getByTestId(`kudos-count-${mateAssign.id}`)).toHaveText('1', {
    timeout: 15_000,
  });

  await page.screenshot({ path: 'e2e/__screens__/tlx-185-mur-palier2.png', fullPage: true });

  // Toggle : retap retire le kudos → compteur masqué (0).
  await kudosBtn.click();
  await expect(page.getByTestId(`kudos-count-${mateAssign.id}`)).toBeHidden({ timeout: 15_000 });
});
