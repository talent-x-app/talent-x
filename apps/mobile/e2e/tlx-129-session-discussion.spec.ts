import { test, expect } from './fixtures';

/**
 * TLX-129 — Discussion de séance (TLX-118, cible sessionId). L'athlète affecté pose une question
 * sur la séance avant saisie ; le coach propriétaire la voit et répond ; l'athlète voit la réponse.
 * Contrôle d'autorisation : un athlète non affecté ne peut pas poster (403).
 */

const Q = 'Faut-il prévoir des pointes pour cette séance ?';
const A = 'Oui, pointes recommandées sur la piste.';

test('athlète pose une question sur la séance → coach répond → athlète voit la réponse', async ({
  page,
  apiSeed,
}) => {
  const coach = await apiSeed.register('coach', 'Coach', 'Disc');
  const athlete = await apiSeed.register('athlete', 'Ath', 'Disc');
  const outsider = await apiSeed.register('athlete', 'Out', 'Sider');
  const group = await apiSeed.createGroup(coach.token);
  await apiSeed.joinGroup(athlete.token, group.inviteCode);
  const sessionId = await apiSeed.createSession(coach.token, { title: 'Séance discussion' });
  const [assignment] = await apiSeed.assign(coach.token, sessionId, {
    athleteIds: [athlete.id],
    dueDate: '2026-06-20',
  });

  // Autorisation : un athlète non affecté ne peut pas poster sur la séance (403).
  expect(await apiSeed.tryPostSessionComment(outsider.token, sessionId, 'intrus')).toBe(403);

  // --- Athlète affecté : poste une question sur la séance (avant saisie) ---
  // Route athlète /session/[id] = id de l'AFFECTATION (getAssignment).
  await apiSeed.loginAs(page, athlete);
  await apiSeed.gotoAuthed(page, `/session/${assignment.id}`, 'feedback-input');
  await page.getByTestId('feedback-input').fill(Q);
  await page.getByTestId('feedback-send').click();
  await expect(page.getByText(Q)).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: 'e2e/__screens__/tlx-129-athlete-question.png', fullPage: true });

  // --- Coach propriétaire : voit la question puis répond ---
  // NB : le détail séance coach (/session/[id], route partagée) n'est pas deep-linkable en
  // web cold-load (rebond /login, cf. fixtures.gotoAuthed) ; son rendu est couvert par RTL.
  // On valide ici le round-trip serveur réel : le coach voit la question et répond.
  const coachView = await apiSeed.listSessionComments(coach.token, sessionId);
  expect(coachView.some((c) => c.body === Q)).toBe(true);
  await apiSeed.postSessionComment(coach.token, sessionId, A);

  // --- Athlète : voit la réponse du coach dans l'UI ---
  await apiSeed.loginAs(page, athlete);
  await apiSeed.gotoAuthed(page, `/session/${assignment.id}`, 'feedback-input');
  await expect(page.getByText(A)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: 'e2e/__screens__/tlx-129-athlete-sees-reply.png', fullPage: true });
});
