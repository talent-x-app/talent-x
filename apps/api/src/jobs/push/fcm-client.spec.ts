import { generateKeyPairSync } from 'node:crypto';
import { FcmClient, type FetchLike } from './fcm-client';
import type { FcmConfig } from './push-config';
import type { PushMessage } from '../push-provider';

/** Clé RS256 réelle pour que la signature du JWT OAuth aboutisse en test. */
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const CONFIG: FcmConfig = {
  projectId: 'talentx-prod',
  clientEmail: 'svc@talentx.iam.gserviceaccount.com',
  privateKey: PEM,
};

const MESSAGE: PushMessage = {
  title: 'Nouveau feedback',
  body: 'Ton coach a commenté une performance.',
  data: { type: 'performance_feedback', resourceId: 'perf-1' },
};

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

type SendResponse = { status: number; body: unknown };

/**
 * `fetch` mocké : répond toujours un access token sur l'endpoint OAuth, et déroule
 * une file de réponses programmées sur l'endpoint d'envoi. Journalise les appels.
 */
function fakeFetch(
  sendResponses: SendResponse[],
  opts: { tokenExpiresIn?: number } = {},
): { fetchFn: FetchLike; calls: Array<{ url: string; body: string }> } {
  const calls: Array<{ url: string; body: string }> = [];
  let i = 0;
  const fetchFn: FetchLike = (url, init) => {
    calls.push({ url, body: init.body });
    if (url === TOKEN_URL) {
      return Promise.resolve(
        jsonResponse(200, {
          access_token: 'ya29.fake',
          expires_in: opts.tokenExpiresIn ?? 3600,
        }),
      );
    }
    const r = sendResponses[i++] ?? { status: 200, body: {} };
    return Promise.resolve(jsonResponse(r.status, r.body));
  };
  return { fetchFn, calls };
}

function jsonResponse(status: number, body: unknown): Awaited<ReturnType<FetchLike>> {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe('FcmClient (TLX-107, ADR-22 §4)', () => {
  it('obtient un access token puis envoie sur messages:send (contenu générique)', async () => {
    const { fetchFn, calls } = fakeFetch([
      { status: 200, body: { name: 'projects/x/messages/1' } },
    ]);
    const res = await new FcmClient(CONFIG, fetchFn).send(
      [{ token: 'device-tok', platform: 'fcm' }],
      MESSAGE,
    );

    expect(res.invalidTokens).toEqual([]);
    expect(calls[0].url).toBe(TOKEN_URL);
    expect(calls[1].url).toBe('https://fcm.googleapis.com/v1/projects/talentx-prod/messages:send');
    const sent = JSON.parse(calls[1].body);
    expect(sent.message.token).toBe('device-tok');
    expect(sent.message.notification).toEqual({
      title: 'Nouveau feedback',
      body: 'Ton coach a commenté une performance.',
    });
    expect(sent.message.data).toEqual({ type: 'performance_feedback', resourceId: 'perf-1' });
  });

  it('404 UNREGISTERED → token invalide', async () => {
    const { fetchFn } = fakeFetch([
      {
        status: 404,
        body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } },
      },
    ]);
    const res = await new FcmClient(CONFIG, fetchFn).send(
      [{ token: 'dead-tok', platform: 'fcm' }],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual(['dead-tok']);
  });

  it('400 INVALID_ARGUMENT (via error.status) → token invalide', async () => {
    const { fetchFn } = fakeFetch([
      { status: 400, body: { error: { status: 'INVALID_ARGUMENT' } } },
    ]);
    const res = await new FcmClient(CONFIG, fetchFn).send(
      [{ token: 'bad-tok', platform: 'fcm' }],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual(['bad-tok']);
  });

  it('500 interne → pas d’invalidation (échec transitoire)', async () => {
    const { fetchFn } = fakeFetch([{ status: 500, body: { error: { status: 'INTERNAL' } } }]);
    const res = await new FcmClient(CONFIG, fetchFn).send(
      [{ token: 'tok', platform: 'fcm' }],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual([]);
  });

  it('met en cache l’access token entre deux envois (un seul appel OAuth)', async () => {
    const { fetchFn, calls } = fakeFetch([
      { status: 200, body: {} },
      { status: 200, body: {} },
    ]);
    const client = new FcmClient(CONFIG, fetchFn);
    await client.send([{ token: 't1', platform: 'fcm' }], MESSAGE);
    await client.send([{ token: 't2', platform: 'fcm' }], MESSAGE);

    const tokenCalls = calls.filter((c) => c.url === TOKEN_URL);
    expect(tokenCalls).toHaveLength(1);
  });

  it('échec OAuth → aucun envoi, aucune invalidation', async () => {
    const fetchFn: FetchLike = (url) => {
      if (url === TOKEN_URL) {
        return Promise.resolve(jsonResponse(401, { error: 'invalid_grant' }));
      }
      throw new Error('ne doit pas envoyer sans token');
    };
    const res = await new FcmClient(CONFIG, fetchFn).send(
      [{ token: 'tok', platform: 'fcm' }],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual([]);
  });
});
