const mockRegisterDevice = jest.fn();
const mockRevokeDevice = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  registerDevice: (...a: unknown[]) => mockRegisterDevice(...a),
  revokeDevice: (...a: unknown[]) => mockRevokeDevice(...a),
}));

// Pas de `jest.mock('expo-notifications')` : le pont reçoit son chargeur (cf. `makeNativePushBridge`).
// Un mock de module serait ici trompeur — sous jest-expo l'import dynamique ne le verrait pas.
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetDevicePushTokenAsync = jest.fn();

import {
  configureForegroundPresentation,
  ensureDeviceRegistered,
  FOREGROUND_BEHAVIOR,
  loadNotificationsModule,
  makeNativePushBridge,
  nativePushBridge,
  platformForOs,
  revokeRegisteredDevice,
  type NotificationsModule,
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

/**
 * Présentation au premier plan — le chaînon dont l'ABSENCE a fait échouer la validation TLX-84
 * sur appareil réel : sans handler, `expo-notifications` avale toute notification reçue pendant
 * que l'app est ouverte, alors que la même s'affiche normalement en arrière-plan. Le symptôme
 * (« l'envoi est OK mais je ne vois rien ») ne désigne pas la cause : d'où ce test.
 */
describe('configureForegroundPresentation', () => {
  it('installe un handler qui demande l’affichage de la notification', async () => {
    const setNotificationHandler = jest.fn();

    configureForegroundPresentation({ setNotificationHandler } as unknown as NotificationsModule);

    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
    const { handleNotification } = setNotificationHandler.mock.calls[0][0];
    await expect(handleNotification()).resolves.toEqual(FOREGROUND_BEHAVIOR);
  });

  it('bannière, liste et son demandés ; badge laissé tranquille', () => {
    // `shouldSetBadge: false` est délibéré : l'app ne tient aucun compteur, une pastille posée
    // ici ne serait jamais remise à zéro.
    expect(FOREGROUND_BEHAVIOR).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});

describe('makeNativePushBridge', () => {
  /** Faux module natif : le pont reçoit son chargeur, on n'a donc rien à résoudre dynamiquement. */
  function fakeModule(): NotificationsModule {
    return {
      getPermissionsAsync: mockGetPermissionsAsync,
      requestPermissionsAsync: mockRequestPermissionsAsync,
      getDevicePushTokenAsync: mockGetDevicePushTokenAsync,
    } as unknown as NotificationsModule;
  }

  const bridgeWithModule = () => makeNativePushBridge(async () => fakeModule());
  /** Dev client antérieur à TLX-226 : le module natif n'est pas dans le binaire. */
  const bridgeWithoutModule = () => makeNativePushBridge(async () => null);

  it('permission déjà accordée : aucune demande à l’utilisateur', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });

    expect(await bridgeWithModule().ensurePermission()).toBe(true);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('permission jamais demandée : on demande et on suit la réponse', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });

    expect(await bridgeWithModule().ensurePermission()).toBe(true);
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('refus définitif : on n’insiste pas (`canAskAgain: false`)', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });

    expect(await bridgeWithModule().ensurePermission()).toBe(false);
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('remonte le jeton natif de l’appareil', async () => {
    mockGetDevicePushTokenAsync.mockResolvedValue({ type: 'fcm', data: 'jeton-natif' });

    expect(await bridgeWithModule().getDeviceToken()).toBe('jeton-natif');
  });

  it('jeton non textuel : ignoré plutôt que remonté tel quel à l’API', async () => {
    // Sur certaines plateformes `data` n'est pas une chaîne ; l'envoyer casserait
    // l'enregistrement côté serveur de façon silencieuse.
    mockGetDevicePushTokenAsync.mockResolvedValue({ type: 'fcm', data: { fake: true } });

    expect(await bridgeWithModule().getDeviceToken()).toBeNull();
  });

  it('jeton indisponible (simulateur, google-services.json absent) : null, pas d’exception', async () => {
    mockGetDevicePushTokenAsync.mockRejectedValue(new Error('no token'));

    expect(await bridgeWithModule().getDeviceToken()).toBeNull();
  });

  it('module natif absent : pas de push, mais l’app démarre (TLX-141/TLX-218)', async () => {
    const bridge = bridgeWithoutModule();

    expect(await bridge.ensurePermission()).toBe(false);
    expect(await bridge.getDeviceToken()).toBeNull();
    // Aucun appel n'est tenté : il n'y a rien à appeler.
    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(mockGetDevicePushTokenAsync).not.toHaveBeenCalled();
  });

  it('le pont de production est câblé sur le chargeur réel', async () => {
    // Sous jest-expo l'import dynamique ne se résout pas : le pont réel dégrade donc en
    // « pas de push », ce qui vérifie au passage qu'il ne lève jamais.
    expect(await nativePushBridge.ensurePermission()).toBe(false);
    expect(await nativePushBridge.getDeviceToken()).toBeNull();
  });
});

describe('loadNotificationsModule', () => {
  it('ne lève jamais : un module introuvable devient « pas de push »', async () => {
    await expect(loadNotificationsModule()).resolves.toBeDefined();
  });
});
