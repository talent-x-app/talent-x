/**
 * Smoke test d'envoi push RÉEL (TLX-84) — APNs (sandbox/prod) + FCM HTTP v1.
 *
 * Réutilise les adaptateurs de production (`ApnsClient`, `FcmClient`,
 * `Http2ApnsTransport`) avec les credentials du `.env`, et frappe vraiment le
 * réseau Apple/Google. Aucune logique de signature dupliquée : on enveloppe juste
 * le transport / `fetch` pour capturer les statuts HTTP et en tirer un diagnostic.
 *
 * Deux modes selon qu'un token d'appareil réel est fourni ou non :
 *
 *   • AVEC token  →  envoi réel. 200 = notification livrée sur l'appareil.
 *   • SANS token  →  sonde d'authentification avec un token bidon. On NE PEUT PAS
 *                    livrer, mais la réponse prouve que les credentials atteignent
 *                    le fournisseur : un « mauvais token » (400/404/410) = creds OK ;
 *                    un 401/403 = creds/permissions à corriger.
 *
 * Usage (depuis apps/api) :
 *   pnpm tsx scripts/push-smoke.ts                       # sonde auth des 2 plateformes
 *   pnpm tsx scripts/push-smoke.ts --apns <deviceToken>  # envoi iOS réel
 *   pnpm tsx scripts/push-smoke.ts --fcm  <deviceToken>  # envoi Android réel
 *   APNS_TEST_TOKEN=… FCM_TEST_TOKEN=… pnpm tsx scripts/push-smoke.ts
 *
 * Ne committe aucun secret : tout vient du `.env` (gitignored).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApnsClient, type ApnsResponse, type ApnsTransport } from '../src/jobs/push/apns-client';
import { FcmClient, type FetchLike } from '../src/jobs/push/fcm-client';
import { Http2ApnsTransport } from '../src/jobs/push/http2-apns-transport';
import { parsePushConfig } from '../src/jobs/push/push-config';
import type { PushMessage, PushTarget } from '../src/jobs/push-provider';

/** Charge `apps/api/.env` dans `process.env` sans dépendance externe (valeurs sur une ligne). */
function loadEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  } catch {
    return; // pas de .env : on s'appuie sur l'environnement déjà présent
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

/** Lit `--flag value` dans argv. */
function argOf(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const MESSAGE: PushMessage = {
  title: 'Talent-X — test',
  body: 'Smoke test push (TLX-84). Si tu vois ceci, le bout-en-bout fonctionne.',
  data: { type: 'performance_submitted' as PushMessage['data']['type'], resourceId: 'smoke-test' },
};

/** Token volontairement invalide pour la sonde d'authentification (aucune livraison). */
const PROBE_TOKEN = '00'.repeat(32);

/**
 * Verdict par plateforme. `skipped` (plateforme non configurée) est **distinct** de `ok` :
 * une plateforme non testée ne doit pas se lire « OK » dans le résumé — sur un script qui sert
 * à valider une rotation de secrets, ce serait un faux positif (un `.env` vide affichait
 * « APNs OK | FCM OK »). Il ne compte pas non plus comme un échec : sans credentials, l'app
 * retombe légitimement sur `LoggingPushProvider` (dev/CI), le code de sortie reste 0.
 */
type CheckResult = 'ok' | 'failed' | 'skipped';

/**
 * Message d'erreur détaillé du fournisseur. Les codes seuls (`PERMISSION_DENIED`, `reason`) ne
 * disent pas **laquelle** des causes possibles s'applique — un 403 FCM peut être une API non
 * activée sur le projet **ou** un rôle IAM manquant, et seul `error.message` tranche. Sans lui,
 * le diagnostic se fait par élimination côté console.
 */
function details(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; reason?: string };
    const message = parsed.error?.message ?? parsed.reason;
    if (message) return message;
  } catch {
    // corps non-JSON : on retombe sur le brut ci-dessous
  }
  const raw = body.trim();
  if (!raw) return '(corps de réponse vide)';
  return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
}

async function checkApns(): Promise<CheckResult> {
  const { apns } = parsePushConfig((k) => process.env[k]);
  if (!apns) {
    console.log('APNs : non configuré (variables APNS_* absentes) — ignoré.');
    return 'skipped';
  }
  const realToken = argOf('--apns') ?? process.env.APNS_TEST_TOKEN;
  const token = realToken ?? PROBE_TOKEN;
  const probe = !realToken;

  // Transport enveloppant le vrai HTTP/2 pour capturer le statut + le corps.
  let last: ApnsResponse = { status: 0, body: '' };
  const real = new Http2ApnsTransport(
    apns.production ? 'api.push.apple.com' : 'api.sandbox.push.apple.com',
  );
  const recording: ApnsTransport = {
    async post(path, headers, body) {
      last = await real.post(path, headers, body);
      return last;
    },
  };

  const client = new ApnsClient(apns, recording);
  const target: PushTarget = { token, platform: 'apns' };
  console.log(
    `\nAPNs → ${apns.production ? 'PROD' : 'sandbox'} | topic=${apns.bundleId} | ` +
      (probe ? 'sonde auth (token bidon)' : `envoi réel sur ${token.slice(0, 10)}…`),
  );
  await client.send([target], MESSAGE);
  real.close();

  const reason = (() => {
    try {
      return (JSON.parse(last.body) as { reason?: string }).reason ?? '';
    } catch {
      return '';
    }
  })();

  if (last.status === 200) {
    console.log(
      '  ✅ 200 — notification acceptée par Apple' +
        (probe ? ' (inattendu pour un token bidon)' : ' et livrée.'),
    );
    return 'ok';
  }
  if (probe && ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(reason)) {
    console.log(
      `  ✅ ${last.status} ${reason} — AUTH OK (creds valides ; échec attendu sur token bidon).`,
    );
    return 'ok';
  }
  if ([401, 403].includes(last.status)) {
    console.log(
      `  ❌ ${last.status} ${reason} — CREDS INVALIDES (Key ID / Team ID / .p8 / topic à vérifier).`,
    );
    console.log(`     ↳ ${details(last.body)}`);
    return 'failed';
  }
  console.log(`  ⚠️  ${last.status} ${reason || '(sans raison)'} — voir réponse Apple.`);
  console.log(`     ↳ ${details(last.body)}`);
  return probe ? 'ok' : 'failed'; // en envoi réel, tout sauf 200 est un échec
}

async function checkFcm(): Promise<CheckResult> {
  const { fcm } = parsePushConfig((k) => process.env[k]);
  if (!fcm) {
    console.log('FCM : non configuré (variables FCM_* absentes) — ignoré.');
    return 'skipped';
  }
  const realToken = argOf('--fcm') ?? process.env.FCM_TEST_TOKEN;
  const token = realToken ?? PROBE_TOKEN;
  const probe = !realToken;

  // fetch enveloppé pour capturer les statuts (endpoint OAuth + messages:send).
  let tokenStatus = 0;
  let sendStatus = 0;
  let sendBody = '';
  const recordingFetch: FetchLike = async (url, init) => {
    const res = await fetch(url, init as RequestInit);
    const text = await res.text();
    if (url.includes('oauth2')) tokenStatus = res.status;
    else {
      sendStatus = res.status;
      sendBody = text;
    }
    return {
      status: res.status,
      ok: res.ok,
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  };

  const client = new FcmClient(fcm, recordingFetch);
  console.log(
    `\nFCM → project=${fcm.projectId} | ` +
      (probe ? 'sonde auth (token bidon)' : `envoi réel sur ${token.slice(0, 10)}…`),
  );
  await client.send([{ token, platform: 'fcm' }], MESSAGE);

  if (tokenStatus !== 200) {
    console.log(
      `  ❌ OAuth ${tokenStatus || '(aucune réponse)'} — compte de service invalide (client_email / private_key / projet).`,
    );
    return 'failed';
  }
  console.log('  ✅ OAuth 200 — compte de service Google valide.');

  const code = (() => {
    try {
      const p = JSON.parse(sendBody) as { error?: { status?: string } };
      return p.error?.status ?? '';
    } catch {
      return '';
    }
  })();

  if (sendStatus === 200) {
    console.log(
      '  ✅ 200 — notification acceptée par FCM' +
        (probe ? ' (inattendu pour un token bidon).' : ' et livrée.'),
    );
    return 'ok';
  }
  if (probe && ['INVALID_ARGUMENT', 'NOT_FOUND', 'UNREGISTERED'].includes(code)) {
    console.log(
      `  ✅ ${sendStatus} ${code} — AUTH OK (creds valides ; échec attendu sur token bidon).`,
    );
    return 'ok';
  }
  if ([401, 403].includes(sendStatus)) {
    console.log(
      `  ❌ ${sendStatus} ${code} — envoi refusé. Causes usuelles : rôle IAM manquant sur le ` +
        `compte de service (roles/cloudmessaging.messagesPublisher) ou API fcm.googleapis.com ` +
        `non activée sur le projet.`,
    );
    console.log(`     ↳ ${details(sendBody)}`);
    return 'failed';
  }
  console.log(`  ⚠️  ${sendStatus} ${code || '(sans code)'} — voir réponse FCM.`);
  console.log(`     ↳ ${details(sendBody)}`);
  return probe ? 'ok' : 'failed';
}

/** Libellé de résumé — « IGNORÉ » n'est ni un succès ni un échec (cf. `CheckResult`). */
function label(result: CheckResult): string {
  return result === 'ok' ? 'OK' : result === 'failed' ? 'ÉCHEC' : 'IGNORÉ (non configuré)';
}

async function main(): Promise<void> {
  loadEnv();
  console.log('=== Smoke test push réel (TLX-84) ===');
  const apns = await checkApns();
  const fcm = await checkFcm();
  console.log(`\nRésultat : APNs ${label(apns)} | FCM ${label(fcm)}`);
  if (apns === 'skipped' && fcm === 'skipped') {
    console.log('Aucune plateforme configurée — rien n’a été vérifié.');
  }
  process.exit(apns === 'failed' || fcm === 'failed' ? 1 : 0);
}

void main();
