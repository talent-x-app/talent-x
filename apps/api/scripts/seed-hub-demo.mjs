/**
 * Seed de démonstration pour tester à la main le hub de groupe athlète (TLX-173).
 * Crée (ou réutilise) un coach + un athlète liés, un groupe « Sprint Élite », et plusieurs
 * séances de disciplines/dates variées affectées à l'athlète (À venir + Passées) pour exercer
 * le fil, le calendrier (pastilles dérivées), le détail et la présence (RSVP, Phase B).
 *
 * Idempotent : ré-exécutable sans dupliquer (login si comptes existants, groupe/séances réutilisés
 * par nom/titre). Lancer l'API d'abord (nest start :3000). `node apps/api/scripts/seed-hub-demo.mjs`.
 */
const BASE = process.env.SEED_API_URL ?? 'http://localhost:3000/api/v1';

const COACH = {
  email: 'coach.tlx173@demo.test',
  password: 'Demo!Pass1',
  firstName: 'Awa',
  lastName: 'Diallo',
};
const ATHLETE = {
  email: 'athlete.tlx173@demo.test',
  password: 'Demo!Pass1',
  firstName: 'Moussa',
  lastName: 'Koné',
};
// Coéquipier de démo : rejoint le groupe et reçoit les mêmes séances → l'agrégat de présence
// (ADR-45) devient visible côté athlète (« 1 présent · 1 sans réponse »).
const TEAMMATE = {
  email: 'teammate.tlx173@demo.test',
  password: 'Demo!Pass1',
  firstName: 'Awa',
  lastName: 'Traoré',
};

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

/** Enregistre un compte ou se connecte s'il existe déjà. Renvoie { token, id }. */
async function ensureUser(role, creds) {
  const reg = await call('/auth/register', {
    method: 'POST',
    body: { ...creds, role },
  });
  let token;
  if (reg.status === 201) {
    token = reg.json.accessToken;
  } else {
    const login = await call('/auth/login', {
      method: 'POST',
      body: { email: creds.email, password: creds.password },
    });
    if (login.status !== 200) {
      throw new Error(`login ${creds.email} → ${login.status} ${JSON.stringify(login.json)}`);
    }
    token = login.json.accessToken;
  }
  const me = await call('/users/me', { token });
  return { token, id: me.json.id };
}

const sessionFor = (title, type, params, dueDate, brief) => ({
  title,
  type,
  params,
  dueDate,
  brief,
});

const SESSIONS = [
  sessionFor('Test 150 m chrono', 'sprint', { distanceMeters: 150, reps: 2 }, '2026-06-21', {
    schemaVersion: 1,
    athleteIntent: 'Valider la vitesse max avant la compèt de samedi.',
  }),
  sessionFor('VMA 30/30', 'endurance', { distanceMeters: 5000 }, '2026-06-23'),
  sessionFor('Départs & accélérations', 'sprint', { distanceMeters: 30, reps: 6 }, '2026-06-25'),
  sessionFor('Renforcement + gainage', 'strength', { sets: 4, reps: 8 }, '2026-06-14'),
  sessionFor('Multibonds', 'jumps', { reps: 5 }, '2026-06-17'),
];

async function main() {
  const health = await call('/health');
  if (health.status !== 200)
    throw new Error(`API injoignable sur ${BASE} (health ${health.status})`);

  const coach = await ensureUser('coach', COACH);
  const athlete = await ensureUser('athlete', ATHLETE);

  // Consentements RGPD (ADR-08) : la progression et la saisie de perf sont consent-gated.
  // « traitement des données » débloque la progression ; « accès coach » la visibilité coach.
  for (const type of ['data_processing', 'coach_access']) {
    await call('/users/me/consents', {
      method: 'PUT',
      token: athlete.token,
      body: { type, granted: true, textVersion: '2026-01' },
    });
  }

  // Groupe « Sprint Élite » : réutilise s'il existe déjà (par nom).
  const groups = await call('/groups', { token: coach.token });
  let group = (groups.json?.data ?? groups.json ?? []).find((g) => g.name === 'Sprint Élite');
  if (!group) {
    const created = await call('/groups', {
      method: 'POST',
      token: coach.token,
      body: { name: 'Sprint Élite', description: 'Groupe de sprint — démo TLX-173' },
    });
    group = created.json;
  }

  const teammate = await ensureUser('athlete', TEAMMATE);

  // Athlète + coéquipier rejoignent le groupe (idempotent côté serveur).
  for (const t of [athlete.token, teammate.token]) {
    await call('/groups/join', {
      method: 'POST',
      token: t,
      body: { inviteCode: group.inviteCode },
    });
  }

  // Séances existantes du coach (réutilise par titre pour ne pas dupliquer).
  const existing = await call('/sessions', { token: coach.token });
  const byTitle = new Map((existing.json?.data ?? []).map((s) => [s.title, s.id]));

  for (const s of SESSIONS) {
    let sessionId = byTitle.get(s.title);
    if (!sessionId) {
      const created = await call('/sessions', {
        method: 'POST',
        token: coach.token,
        body: {
          title: s.title,
          status: 'published',
          exercises: {
            schemaVersion: 3,
            items: [{ name: s.title, order: 0, type: s.type, params: s.params }],
          },
          ...(s.brief ? { brief: s.brief } : {}),
        },
      });
      sessionId = created.json.id;
    }
    await call(`/sessions/${sessionId}/assign`, {
      method: 'POST',
      token: coach.token,
      idem: `seed-assign-${sessionId}-${athlete.id}`,
      body: { athleteIds: [athlete.id, teammate.id], dueDate: s.dueDate },
    });
  }

  // Le coéquipier déclare « présent » sur ses séances → agrégat visible (ADR-45).
  const teammateAssignments = await call('/assignments', { token: teammate.token });
  for (const a of teammateAssignments.json?.data ?? []) {
    await call(`/assignments/${a.id}/attendance`, {
      method: 'PUT',
      token: teammate.token,
      body: { attendance: 'going' },
    });
  }

  const list = await call('/assignments', { token: athlete.token });
  const count = (list.json?.data ?? []).length;

  console.log('\n✅ Seed prêt.');
  console.log('— URL (Expo web) : http://localhost:8081');
  console.log(`— Athlète : ${ATHLETE.email} / ${ATHLETE.password}`);
  console.log(`— Coach   : ${COACH.email} / ${COACH.password}`);
  console.log(`— Groupe  : ${group.name} (${group.id})`);
  console.log(`— Affectations de l'athlète : ${count}`);
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
