/**
 * Ajoute 15 coéquipiers au groupe de démo « Sprint Élite » (TLX-173), leur affecte les séances du
 * groupe (fan-out ADR-30) et leur fait déclarer des présences variées (ADR-43/45) → l'onglet
 * Coéquipiers et l'agrégat de présence sont bien remplis. Idempotent. Lancer l'API d'abord.
 *   node apps/api/scripts/seed-teammates.mjs
 */
const BASE = process.env.SEED_API_URL ?? 'http://localhost:3000/api/v1';
const PWD = 'Demo!Pass1';
const COACH = { email: 'coach.tlx173@demo.test', password: PWD };

async function call(path, { method = 'GET', token, body, idem } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function ensureUser(role, email, firstName, lastName) {
  const reg = await call('/auth/register', {
    method: 'POST',
    body: { email, password: PWD, role, firstName, lastName },
  });
  if (reg.status === 201) return { token: reg.json.accessToken, id: reg.json.user.id };
  const login = await call('/auth/login', { method: 'POST', body: { email, password: PWD } });
  const me = await call('/users/me', { token: login.json.accessToken });
  return { token: login.json.accessToken, id: me.json.id };
}

// 15 coéquipiers + plan de présence (going par défaut ; variété pour un agrégat réaliste).
const TEAMMATES = [
  ['Fatou', 'Sow', 'going'],
  ['Cheikh', 'Ndiaye', 'going'],
  ['Mariama', 'Bâ', 'going'],
  ['Ousmane', 'Fall', 'going'],
  ['Aïcha', 'Diop', 'going'],
  ['Ibrahima', 'Sy', 'going'],
  ['Khady', 'Camara', 'going'],
  ['Modou', 'Gueye', 'going'],
  ['Bineta', 'Sarr', 'going'],
  ['Lamine', 'Diouf', 'not_going'],
  ['Rokhaya', 'Mbaye', 'not_going'],
  ['Pape', 'Faye', 'maybe'],
  ['Ndeye', 'Thiam', 'maybe'],
  ['Serigne', 'Lo', null], // sans réponse
  ['Adama', 'Cissé', null], // sans réponse
];

async function main() {
  if ((await call('/health')).status !== 200) throw new Error(`API injoignable sur ${BASE}`);
  const coach = await ensureUser('coach', COACH.email, 'Awa', 'Diallo');

  const groups = await call('/groups', { token: coach.token });
  const group = (groups.json?.data ?? []).find((g) => g.name === 'Sprint Élite');
  if (!group)
    throw new Error('Groupe « Sprint Élite » introuvable — lance d’abord seed-hub-demo.mjs');

  const sessions = (await call('/sessions', { token: coach.token })).json?.data ?? [];

  // 1) Tous rejoignent le groupe d'abord (le fan-out ADR-30 est un instantané des membres).
  const joinedTeammates = [];
  for (let i = 0; i < TEAMMATES.length; i++) {
    const [first, last, attendance] = TEAMMATES[i];
    const t = await ensureUser('athlete', `athlete.t${i + 2}@demo.test`, first, last);
    await call('/groups/join', {
      method: 'POST',
      token: t.token,
      body: { inviteCode: group.inviteCode },
    });
    joinedTeammates.push({ ...t, attendance });
  }

  // 2) Affecte chaque séance au groupe (fan-out à TOUS les membres actifs, idempotent).
  for (const s of sessions) {
    await call(`/sessions/${s.id}/assign`, {
      method: 'POST',
      token: coach.token,
      idem: `assign-${s.id}-group-${joinedTeammates.length}`,
      body: { groupIds: [group.id] },
    });
  }

  // 3) Présence variée par coéquipier (null = sans réponse).
  for (const t of joinedTeammates) {
    if (!t.attendance) continue;
    const mine = (await call('/assignments', { token: t.token })).json?.data ?? [];
    for (const a of mine) {
      await call(`/assignments/${a.id}/attendance`, {
        method: 'PUT',
        token: t.token,
        body:
          t.attendance === 'not_going'
            ? { attendance: t.attendance, reason: 'injury' }
            : { attendance: t.attendance },
      });
    }
  }
  const joined = joinedTeammates.length;

  const members =
    (await call(`/groups/${group.id}/members`, { token: coach.token })).json?.data ?? [];
  console.log(`\n✅ ${joined} coéquipiers ajoutés à « ${group.name} ».`);
  console.log(`— Membres du groupe : ${members.length}`);
  console.log('— Rafraîchis l’app (athlete.tlx173@demo.test / Demo!Pass1) → onglet Groupe.');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
