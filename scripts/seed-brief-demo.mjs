// Seed de démonstration pour la vérif live du brief (ADR-28, TLX-99). Non commité.
// Crée (ou réutilise) un coach + un athlète liés, une séance publiée AVEC brief, et
// l'affecte à l'athlète. Idempotent : ré-exécutable (login si le compte existe déjà).
const BASE = process.env.SEED_BASE_URL ?? 'http://localhost:3000/api/v1';
const PASSWORD = 'Sup3rSecret!';
const COACH = 'coach-brief@demo.test';
const ATHLETE = 'athlete-brief@demo.test';

async function api(path, { method = 'GET', token, body, idem } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { status: res.status, data };
}

async function registerOrLogin(email, role) {
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD, role, firstName: 'Démo', lastName: role },
  });
  if (reg.status === 201) return { id: reg.data.user.id, token: reg.data.accessToken };
  const log = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
  if (log.status !== 200)
    throw new Error(`login ${email} → ${log.status} ${JSON.stringify(log.data)}`);
  return { id: log.data.user.id, token: log.data.accessToken };
}

const BRIEF = {
  athleteIntent: 'Des efforts courts et rapides, réguliers. Ne pars pas trop vite.',
  durationMinutes: 75,
  difficulty: 7,
  successCriteria: 'Tenir les 16 efforts au même rythme.',
  stopCriteria: "Ta foulée s'écrase ou tu ne suis plus l'allure.",
  intent: 'Intermittent court à haute intensité (VO₂max). Régularité > sprint.',
  coachNotes: {
    regression: '2 × 6 rép. si décrochage ; récup 1 min.',
    progression: 'Semaine suivante 2 × 10 rép. ou 40/20.',
    caution: 'Reprise après semaine chargée — surveiller la qualité des appuis.',
  },
};

const coach = await registerOrLogin(COACH, 'coach');
const athlete = await registerOrLogin(ATHLETE, 'athlete');
await api('/users/me/consents', {
  method: 'PUT',
  token: athlete.token,
  body: { type: 'data_processing', granted: true },
});
await api('/users/me/consents', {
  method: 'PUT',
  token: athlete.token,
  body: { type: 'coach_access', granted: true },
});

const group = await api('/groups', {
  method: 'POST',
  token: coach.token,
  body: { name: 'Démo brief' },
});
await api('/groups/join', {
  method: 'POST',
  token: athlete.token,
  body: { inviteCode: group.data.inviteCode },
});

const session = await api('/sessions', {
  method: 'POST',
  token: coach.token,
  body: {
    title: 'Intermittent VO₂max',
    status: 'published',
    exercises: {
      schemaVersion: 2,
      items: [
        { name: 'Footing + gammes', order: 0, type: 'warmup', durationSeconds: 900 },
        {
          name: '16 × 30/30',
          order: 1,
          type: 'interval',
          params: { reps: 16, workSeconds: 30, recoverySeconds: 30, distanceMeters: 150 },
        },
        { name: 'Footing lent', order: 2, type: 'cooldown', durationSeconds: 600 },
      ],
    },
    brief: BRIEF,
  },
});
if (session.status !== 201)
  throw new Error(`create session → ${session.status} ${JSON.stringify(session.data)}`);

const assign = await api(`/sessions/${session.data.id}/assign`, {
  method: 'POST',
  token: coach.token,
  idem: `seed-assign-${session.data.id}`,
  body: { athleteIds: [athlete.id] },
});
const assignmentId = assign.data?.data?.[0]?.id;

console.log(
  JSON.stringify(
    {
      coachLogin: { email: COACH, password: PASSWORD },
      athleteLogin: { email: ATHLETE, password: PASSWORD },
      sessionId: session.data.id,
      assignmentId,
      coachBriefVisible: session.data.brief?.intent != null,
    },
    null,
    2,
  ),
);
