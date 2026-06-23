#!/usr/bin/env node
/**
 * Seed de démo « Mur d'équipe » (ADR-48, Palier 1) pour test UI manuel.
 *
 * Monte, via l'API REST (comptes RÉELLEMENT connectables, contrairement au seed Prisma) :
 *   - 1 coach + 3 athlètes, tous dans un même groupe ;
 *   - 1 annonce du coach, avec réactions + accusés de lecture de coéquipiers
 *     (→ pastilles agrégées « ❤️ 2 » et barre « X/Y lu » non triviales) ;
 *   - 1 séance de groupe à venir cette semaine + présences RSVP « going »
 *     (→ bannière de présence narrative « N coéquipiers t'attendent ») ;
 *   - 1 perf soumise (→ alimente le pouls d'équipe : séance complétée / record).
 *
 * Puis affiche l'email + mot de passe de l'athlète principal pour explorer le Mur.
 *
 * Prérequis : Postgres up + API NestJS up (cf. README e2e). Aucune valeur en dur :
 *   E2E_API_URL        (défaut http://localhost:3000/api/v1)
 *   E2E_TEST_PASSWORD  (défaut SecureP@ss123!)
 *
 * Usage :  node scripts/seed-mur-demo.mjs
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000/api/v1';
const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'SecureP@ss123!';

const stamp = () => Date.now().toString(36);
const rand = () => Math.round(Math.random() * 1e6).toString(36);
const uniq = () => `${stamp()}-${rand()}`;

/** Prochain lundi→dimanche : une date à venir DANS la semaine courante (le pouls borne ainsi). */
function thisWeekUpcomingDate() {
  const d = new Date();
  // +2 jours, en restant dans la semaine si possible ; sinon aujourd'hui.
  d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function call(method, path, { token, body, idempotent } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotent) headers['Idempotency-Key'] = `seed-${uniq()}`;
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

async function register(role, firstName, lastName) {
  const email = `${role}-mur-${uniq()}@example.com`;
  const body = await call('POST', '/auth/register', {
    body: { email, password: PASSWORD, role, firstName, lastName },
  });
  return {
    email,
    password: PASSWORD,
    token: body.accessToken,
    id: body.user?.id ?? body.userId ?? body.id,
    firstName,
  };
}

async function main() {
  // 0) API joignable ?
  try {
    await call('GET', '/health');
  } catch (e) {
    console.error(
      `\n❌ API injoignable sur ${API_URL}\n   Lance Postgres + \`pnpm exec nest start\` depuis apps/api, puis réessaie.\n`,
    );
    throw e;
  }

  console.log("▶ Seed « Mur d'équipe » en cours…\n");

  // 1) Acteurs
  const coach = await register('coach', 'Awa', 'Diallo');
  const alex = await register('athlete', 'Alex', 'Martin'); // athlète principal (celui qu'on explore)
  const lea = await register('athlete', 'Léa', 'Bernard');
  const karim = await register('athlete', 'Karim', 'Sow');
  const teammates = [lea, karim];

  // 2) Groupe + adhésions + consentement
  const group = await call('POST', '/groups', {
    token: coach.token,
    body: { name: 'Sprint Élite' },
  });
  for (const a of [alex, ...teammates]) {
    await call('POST', '/groups/join', { token: a.token, body: { inviteCode: group.inviteCode } });
    await call('PUT', '/users/me/consents', {
      token: a.token,
      body: { type: 'data_processing', granted: true, textVersion: '2026-01' },
    });
  }

  // 3) Annonce du coach
  const ann = await call('POST', `/groups/${group.id}/announcements`, {
    token: coach.token,
    body: { body: 'Changement de lieu jeudi : RDV au stade couvert, échauffement 18h00 pile. 💪' },
  });

  // 4) Réactions + lectures des coéquipiers (→ agrégats non triviaux côté Alex)
  await call(
    'PUT',
    `/groups/${group.id}/announcements/${ann.id}/reactions/${encodeURIComponent('❤️')}`,
    { token: lea.token },
  );
  await call(
    'PUT',
    `/groups/${group.id}/announcements/${ann.id}/reactions/${encodeURIComponent('❤️')}`,
    { token: karim.token },
  );
  await call(
    'PUT',
    `/groups/${group.id}/announcements/${ann.id}/reactions/${encodeURIComponent('🔥')}`,
    { token: lea.token },
  );
  for (const a of teammates) {
    await call('PUT', `/groups/${group.id}/announcements/${ann.id}/read`, { token: a.token });
  }

  // 5) Séance de groupe à venir cette semaine + présences (→ pouls + présence narrative)
  const dueDate = thisWeekUpcomingDate();
  const session = await call('POST', '/sessions', {
    token: coach.token,
    body: {
      title: 'Footing collectif + lignes',
      status: 'published',
      exercises: {
        schemaVersion: 1,
        items: [{ name: '100m', order: 1, type: 'sprint', params: { distanceMeters: 100 } }],
      },
    },
  });
  const assignRes = await call('POST', `/sessions/${session.id}/assign`, {
    token: coach.token,
    idempotent: true,
    body: { athleteIds: [alex.id, lea.id, karim.id], dueDate },
  });
  const assignments = assignRes.data ?? [];
  const byAthlete = Object.fromEntries(assignments.map((x) => [x.athleteId, x.id]));
  for (const a of [alex, ...teammates]) {
    const id = byAthlete[a.id];
    if (id) {
      await call('PUT', `/assignments/${id}/attendance`, {
        token: a.token,
        body: { attendance: 'going' },
      });
    }
  }

  // 6) Une perf soumise par un coéquipier (→ « séance complétée » du pouls de la semaine)
  const leaAssign = byAthlete[lea.id];
  if (leaAssign) {
    try {
      await call('POST', `/assignments/${leaAssign}/performance`, {
        token: lea.token,
        idempotent: true,
        body: {
          results: {
            schemaVersion: 1,
            items: [
              {
                exerciseName: '100m',
                order: 1,
                setResults: [{ set: 1, distanceMeters: 100, timeSeconds: 12.4, completed: true }],
              },
            ],
          },
          rpe: 7,
        },
      });
    } catch (e) {
      console.warn('  (perf de démo ignorée : ' + e.message + ')');
    }
  }

  // --- Récap ---
  console.log('✅ Seed terminé.\n');
  console.log('Groupe          :', group.name, `(id ${group.id})`);
  console.log("Code d'invitation:", group.inviteCode);
  console.log('Annonce         :', ann.id, '— 2× ❤️, 1× 🔥, 2/3 lu');
  console.log('Séance à venir  :', session.title, `(échéance ${dueDate}, 3 présents)`);
  console.log('');
  console.log('── Connexion pour explorer le Mur (onglet Groupe → Annonces) ──');
  console.log('  ATHLÈTE principal :', alex.email);
  console.log('  COACH             :', coach.email);
  console.log('  Mot de passe      :', PASSWORD);
  console.log('');
  console.log("Côté Alex tu dois voir : le pouls d'équipe, la bannière « 2 coéquipiers");
  console.log("seront là avec toi », l'annonce avec ❤️ 2 / 🔥 1 et la barre « 2/3 lu ».");
}

main().catch((e) => {
  console.error('\n❌ Échec du seed :\n' + e.message + '\n');
  process.exit(1);
});
