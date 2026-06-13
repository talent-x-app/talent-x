import { generateKeyPairSync } from 'node:crypto';
import { ApnsClient, type ApnsResponse, type ApnsTransport } from './apns-client';
import type { ApnsConfig } from './push-config';
import type { PushMessage } from '../push-provider';

/** Clé ES256 (P-256) réelle pour que `jwt.sign` aboutisse en test. */
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const CONFIG: ApnsConfig = {
  keyId: 'KID123',
  teamId: 'TEAM123',
  bundleId: 'com.talentx.app',
  privateKey: PEM,
  production: false,
};

const MESSAGE: PushMessage = {
  title: 'Nouvelle séance',
  body: 'Une séance t’a été affectée.',
  data: { type: 'session_assigned', resourceId: 'asg-1' },
};

/** Transport mocké : file de réponses + journal des appels. */
function fakeTransport(responses: ApnsResponse[]): {
  transport: ApnsTransport;
  calls: Array<{ path: string; headers: Record<string, string>; body: string }>;
} {
  const calls: Array<{ path: string; headers: Record<string, string>; body: string }> = [];
  let i = 0;
  const transport: ApnsTransport = {
    post: (path, headers, body) => {
      calls.push({ path, headers, body });
      return Promise.resolve(responses[i++] ?? { status: 200, body: '' });
    },
  };
  return { transport, calls };
}

describe('ApnsClient (TLX-107, ADR-22 §4)', () => {
  it('envoie sur /3/device/<token> avec auth bearer, topic et contenu générique', async () => {
    const { transport, calls } = fakeTransport([{ status: 200, body: '' }]);
    const res = await new ApnsClient(CONFIG, transport).send(
      [{ token: 'device-tok', platform: 'apns' }],
      MESSAGE,
    );

    expect(res.invalidTokens).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/3/device/device-tok');
    expect(calls[0].headers.authorization).toMatch(/^bearer /);
    expect(calls[0].headers['apns-topic']).toBe('com.talentx.app');
    const payload = JSON.parse(calls[0].body);
    expect(payload.aps.alert).toEqual({
      title: 'Nouvelle séance',
      body: 'Une séance t’a été affectée.',
    });
    // Signal seulement : type + resourceId, aucune donnée métier (ADR-10).
    expect(payload.type).toBe('session_assigned');
    expect(payload.resourceId).toBe('asg-1');
  });

  it('410 Unregistered → token remonté comme invalide', async () => {
    const { transport } = fakeTransport([{ status: 410, body: '{"reason":"Unregistered"}' }]);
    const res = await new ApnsClient(CONFIG, transport).send(
      [{ token: 'dead-tok', platform: 'apns' }],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual(['dead-tok']);
  });

  it('400 BadDeviceToken → token invalide', async () => {
    const { transport } = fakeTransport([{ status: 400, body: '{"reason":"BadDeviceToken"}' }]);
    const res = await new ApnsClient(CONFIG, transport).send(
      [{ token: 'bad-tok', platform: 'apns' }],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual(['bad-tok']);
  });

  it('autre erreur (ex. 429 TooManyRequests) → pas d’invalidation', async () => {
    const { transport } = fakeTransport([{ status: 429, body: '{"reason":"TooManyRequests"}' }]);
    const res = await new ApnsClient(CONFIG, transport).send(
      [{ token: 'tok', platform: 'apns' }],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual([]);
  });

  it('panne réseau du transport → échec avalé, token non invalidé', async () => {
    const transport: ApnsTransport = { post: () => Promise.reject(new Error('ECONNRESET')) };
    const res = await new ApnsClient(CONFIG, transport).send(
      [{ token: 'tok', platform: 'apns' }],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual([]);
  });

  it('agrège plusieurs cibles (un mort parmi des valides)', async () => {
    const { transport } = fakeTransport([
      { status: 200, body: '' },
      { status: 410, body: '{"reason":"Unregistered"}' },
      { status: 200, body: '' },
    ]);
    const res = await new ApnsClient(CONFIG, transport).send(
      [
        { token: 't1', platform: 'apns' },
        { token: 't2', platform: 'apns' },
        { token: 't3', platform: 'apns' },
      ],
      MESSAGE,
    );
    expect(res.invalidTokens).toEqual(['t2']);
  });

  it('réutilise le JWT provider tant qu’il est récent, le régénère après l’échéance', async () => {
    let nowMs = 1_000_000;
    const { transport, calls } = fakeTransport([
      { status: 200, body: '' },
      { status: 200, body: '' },
    ]);
    const client = new ApnsClient(CONFIG, transport, () => nowMs);

    await client.send([{ token: 't1', platform: 'apns' }], MESSAGE);
    const firstJwt = calls[0].headers.authorization;

    // < 50 min plus tard : même jeton.
    nowMs += 10 * 60 * 1000;
    await client.send([{ token: 't1', platform: 'apns' }], MESSAGE);
    expect(calls[1].headers.authorization).toBe(firstJwt);
  });

  it('hôte sandbox vs prod selon la config', () => {
    expect(new ApnsClient(CONFIG, fakeTransport([]).transport).host).toBe(
      'api.sandbox.push.apple.com',
    );
    expect(new ApnsClient({ ...CONFIG, production: true }, fakeTransport([]).transport).host).toBe(
      'api.push.apple.com',
    );
  });
});
