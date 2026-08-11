const mockRegisterDevice = jest.fn();
const mockRevokeDevice = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  registerDevice: (...a: unknown[]) => mockRegisterDevice(...a),
  revokeDevice: (...a: unknown[]) => mockRevokeDevice(...a),
}));

import {
  ensureDeviceRegistered,
  platformForOs,
  revokeRegisteredDevice,
  type PushBridge,
} from './push-registration';
import type { KeyValueStore } from '../offline/key-value-store';

/** Magasin mémoire — les modules de persistance sont injectables par construction (TLX-077). */
function memoryStore(seed: Record<string, string> = {}): KeyValueStore & { dump(): typeof seed } {
  const data = { ...seed };
  return {
    getItem: async (k) => data[k] ?? null,
    setItem: async (k, v) => {
      data[k] = v;
    },
    removeItem: async (k) => {
      delete data[k];
    },
    dump: () => data,
  };
}

function bridge(over: Partial<PushBridge> = {}): PushBridge {
  return {
    ensurePermission: async () => true,
    getDeviceToken: async () => 'tok-abc',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('platformForOs', () => {
  it('mappe l’OS sur la plateforme du contrat', () => {
    expect(platformForOs('ios')).toBe('apns');
    expect(platformForOs('android')).toBe('fcm');
  });

  it('renvoie null hors mobile (aucun transport push côté serveur pour le web)', () => {
    expect(platformForOs('web')).toBeNull();
    expect(platformForOs('windows')).toBeNull();
  });
});

describe('ensureDeviceRegistered', () => {
  it('enregistre l’appareil et persiste id + jeton', async () => {
    mockRegisterDevice.mockResolvedValue({ status: 201, data: { id: 'dev-1' } });
    const store = memoryStore();

    const outcome = await ensureDeviceRegistered({ bridge: bridge(), store, os: 'android' });

    expect(outcome).toBe('registered');
    expect(mockRegisterDevice).toHaveBeenCalledWith({ platform: 'fcm', token: 'tok-abc' });
    expect(store.dump()['push.device.id']).toBe('dev-1');
    expect(store.dump()['push.device.token']).toBe('tok-abc');
  });

  it('idempotent : même jeton déjà enregistré → aucun appel réseau', async () => {
    const store = memoryStore({ 'push.device.id': 'dev-1', 'push.device.token': 'tok-abc' });

    const outcome = await ensureDeviceRegistered({ bridge: bridge(), store, os: 'ios' });

    expect(outcome).toBe('unchanged');
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it('ré-enregistre quand le jeton a changé (rotation côté OS)', async () => {
    mockRegisterDevice.mockResolvedValue({ status: 201, data: { id: 'dev-2' } });
    const store = memoryStore({ 'push.device.id': 'dev-1', 'push.device.token': 'ancien' });

    const outcome = await ensureDeviceRegistered({ bridge: bridge(), store, os: 'ios' });

    expect(outcome).toBe('registered');
    expect(mockRegisterDevice).toHaveBeenCalledWith({ platform: 'apns', token: 'tok-abc' });
    expect(store.dump()['push.device.id']).toBe('dev-2');
  });

  it('permission refusée : chemin normal, aucun appel ni jeton demandé', async () => {
    const getDeviceToken = jest.fn();
    const outcome = await ensureDeviceRegistered({
      bridge: bridge({ ensurePermission: async () => false, getDeviceToken }),
      store: memoryStore(),
      os: 'android',
    });

    expect(outcome).toBe('denied');
    expect(getDeviceToken).not.toHaveBeenCalled();
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it('jeton indisponible (dev client sans module natif, simulateur) → unavailable', async () => {
    const outcome = await ensureDeviceRegistered({
      bridge: bridge({ getDeviceToken: async () => null }),
      store: memoryStore(),
      os: 'android',
    });

    expect(outcome).toBe('unavailable');
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it('web : aucune tentative, même pas la permission', async () => {
    const ensurePermission = jest.fn();
    const outcome = await ensureDeviceRegistered({
      bridge: bridge({ ensurePermission }),
      store: memoryStore(),
      os: 'web',
    });

    expect(outcome).toBe('unsupported');
    expect(ensurePermission).not.toHaveBeenCalled();
  });

  it('réponse non-201 : rien n’est persisté (pas de faux « déjà enregistré »)', async () => {
    mockRegisterDevice.mockResolvedValue({ status: 422, data: { error: 'VALIDATION_FAILED' } });
    const store = memoryStore();

    expect(await ensureDeviceRegistered({ bridge: bridge(), store, os: 'android' })).toBe('failed');
    expect(store.dump()).toEqual({});
  });

  it('panne réseau : échec silencieux, rien persisté → nouvelle tentative au prochain lancement', async () => {
    mockRegisterDevice.mockRejectedValue(new Error('network down'));
    const store = memoryStore();

    expect(await ensureDeviceRegistered({ bridge: bridge(), store, os: 'android' })).toBe('failed');
    expect(store.dump()).toEqual({});
  });
});

describe('revokeRegisteredDevice', () => {
  it('révoque l’appareil connu puis purge le stockage local', async () => {
    mockRevokeDevice.mockResolvedValue({ status: 204 });
    const store = memoryStore({ 'push.device.id': 'dev-1', 'push.device.token': 'tok-abc' });

    await revokeRegisteredDevice(store);

    expect(mockRevokeDevice).toHaveBeenCalledWith('dev-1');
    expect(store.dump()).toEqual({});
  });

  it('sans appareil enregistré : aucun appel, purge quand même', async () => {
    const store = memoryStore();
    await revokeRegisteredDevice(store);
    expect(mockRevokeDevice).not.toHaveBeenCalled();
    expect(store.dump()).toEqual({});
  });

  it('échec serveur : ne lève pas et purge quand même (déconnexion jamais bloquée)', async () => {
    mockRevokeDevice.mockRejectedValue(new Error('500'));
    const store = memoryStore({ 'push.device.id': 'dev-1', 'push.device.token': 'tok-abc' });

    await expect(revokeRegisteredDevice(store)).resolves.toBeUndefined();
    // Aucun identifiant d'appareil orphelin ne reste dans le trousseau (minimisation RGPD).
    expect(store.dump()).toEqual({});
  });
});
