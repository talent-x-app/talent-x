import { PlatformPushProvider } from './platform-push-provider';
import type { ApnsClient } from './apns-client';
import type { FcmClient } from './fcm-client';
import type { PushMessage, PushResult, PushTarget } from '../push-provider';

const MESSAGE: PushMessage = {
  title: 'Groupe mis à jour',
  body: 'Un athlète a rejoint votre groupe.',
  data: { type: 'group_update', resourceId: 'grp-1' },
};

function clientMock(invalidTokens: string[] = []): {
  client: ApnsClient & FcmClient;
  send: jest.Mock;
} {
  const send = jest.fn().mockResolvedValue({ invalidTokens } as PushResult);
  return { client: { send } as unknown as ApnsClient & FcmClient, send };
}

const APNS_TARGET: PushTarget = { token: 'ios-tok', platform: 'apns' };
const FCM_TARGET: PushTarget = { token: 'and-tok', platform: 'fcm' };

describe('PlatformPushProvider (TLX-107)', () => {
  it('route chaque cible vers l’adaptateur de sa plateforme', async () => {
    const apns = clientMock();
    const fcm = clientMock();
    const provider = new PlatformPushProvider(apns.client, fcm.client);

    await provider.send([APNS_TARGET, FCM_TARGET], MESSAGE);

    expect(apns.send).toHaveBeenCalledWith([APNS_TARGET], MESSAGE);
    expect(fcm.send).toHaveBeenCalledWith([FCM_TARGET], MESSAGE);
  });

  it('agrège les tokens invalides des deux adaptateurs', async () => {
    const apns = clientMock(['ios-dead']);
    const fcm = clientMock(['and-dead']);
    const provider = new PlatformPushProvider(apns.client, fcm.client);

    const res = await provider.send([APNS_TARGET, FCM_TARGET], MESSAGE);
    expect(res.invalidTokens.sort()).toEqual(['and-dead', 'ios-dead']);
  });

  it('n’appelle pas un adaptateur sans cible de sa plateforme', async () => {
    const apns = clientMock();
    const fcm = clientMock();
    const provider = new PlatformPushProvider(apns.client, fcm.client);

    await provider.send([FCM_TARGET], MESSAGE);
    expect(apns.send).not.toHaveBeenCalled();
    expect(fcm.send).toHaveBeenCalledTimes(1);
  });

  it('plateforme non configurée → cibles ignorées, jamais invalidées', async () => {
    const fcm = clientMock();
    const provider = new PlatformPushProvider(null, fcm.client);

    const res = await provider.send([APNS_TARGET, FCM_TARGET], MESSAGE);
    expect(fcm.send).toHaveBeenCalledWith([FCM_TARGET], MESSAGE);
    // La cible APNs n'est ni envoyée ni signalée invalide (pas d'adaptateur).
    expect(res.invalidTokens).toEqual([]);
  });
});
