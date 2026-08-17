import { render, waitFor } from '@testing-library/react-native';

const mockRegisterDevice = jest.fn();
const mockRevokeDevice = jest.fn();
const mockPush = jest.fn();
let mockRole: 'athlete' | 'coach' | null = 'athlete';

jest.mock('@talent-x/api-client', () => ({
  registerDevice: (...a: unknown[]) => mockRegisterDevice(...a),
  revokeDevice: (...a: unknown[]) => mockRevokeDevice(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ role: mockRole, isLoading: false, signIn: jest.fn(), signOut: jest.fn() }),
}));
// `deviceStore` s'appuie dessus : magasin mémoire, pas de trousseau natif en test.
// **Vidé à chaque test** (cf. `beforeEach`) : sans ça, l'enregistrement du premier cas persiste et
// les suivants empruntent le chemin idempotent « déjà enregistré » — un état qui fuit d'un test à
// l'autre, et le genre de faux verdict que TLX-225 traque.
const mockSecureData: Record<string, string> = {};
jest.mock('../auth/secure-storage', () => ({
  secureGet: async (k: string) => mockSecureData[k] ?? null,
  secureSet: async (k: string, v: string) => {
    mockSecureData[k] = v;
  },
  secureDelete: async (k: string) => {
    delete mockSecureData[k];
  },
}));

import { PushRegistration } from './PushRegistration';
import type { NotificationsModule } from './push-registration';

/** Faux module natif : capture le listener pour rejouer un tap + le handler de premier plan. */
function fakeNotifications() {
  const remove = jest.fn();
  const setNotificationHandler = jest.fn();
  let handler: ((response: unknown) => void) | null = null;
  const module = {
    setNotificationHandler,
    addNotificationResponseReceivedListener: (fn: (response: unknown) => void) => {
      handler = fn;
      return { remove };
    },
  } as unknown as NotificationsModule;
  return {
    load: async () => module,
    remove,
    setNotificationHandler,
    tap(type: string, resourceId: string) {
      handler?.({ notification: { request: { content: { data: { type, resourceId } } } } });
    },
    /** Rejoue la décision d'affichage prise pour un push arrivant app ouverte. */
    async foregroundBehavior() {
      const [installed] = setNotificationHandler.mock.calls[0] as [
        { handleNotification: (n: unknown) => Promise<unknown> },
      ];
      return installed.handleNotification({});
    },
    get subscribed() {
      return handler !== null;
    },
  };
}

const bridge = { ensurePermission: async () => true, getDeviceToken: async () => 'tok-1' };

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockSecureData)) delete mockSecureData[key];
  mockRole = 'athlete';
  mockRegisterDevice.mockResolvedValue({ status: 201, data: { id: 'dev-1' } });
});

describe('PushRegistration (TLX-226)', () => {
  it('enregistre l’appareil une fois connecté', async () => {
    const notifs = fakeNotifications();
    render(<PushRegistration bridge={bridge} os="android" loadNotifications={notifs.load} />);

    await waitFor(() =>
      expect(mockRegisterDevice).toHaveBeenCalledWith({ platform: 'fcm', token: 'tok-1' }),
    );
  });

  it('n’enregistre rien tant que personne n’est connecté (endpoint authentifié)', async () => {
    mockRole = null;
    const notifs = fakeNotifications();
    render(<PushRegistration bridge={bridge} os="android" loadNotifications={notifs.load} />);

    await waitFor(() => expect(notifs.subscribed).toBe(true));
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it('tap sur une notification → ouvre la ressource via le mapping partagé', async () => {
    const notifs = fakeNotifications();
    render(<PushRegistration bridge={bridge} os="android" loadNotifications={notifs.load} />);
    await waitFor(() => expect(notifs.subscribed).toBe(true));

    notifs.tap('session_assigned', 'as-42');

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(athlete)/session/[id]',
      params: { id: 'as-42' },
    });
  });

  it('tap non navigable pour le rôle : aucune navigation', async () => {
    const notifs = fakeNotifications();
    render(<PushRegistration bridge={bridge} os="android" loadNotifications={notifs.load} />);
    await waitFor(() => expect(notifs.subscribed).toBe(true));

    // `performance_submitted` vise la revue coach : rien à ouvrir pour un athlète.
    notifs.tap('performance_submitted', 'as-42');

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('charge utile incomplète : ignorée sans planter', async () => {
    const notifs = fakeNotifications();
    render(<PushRegistration bridge={bridge} os="android" loadNotifications={notifs.load} />);
    await waitFor(() => expect(notifs.subscribed).toBe(true));

    notifs.tap('session_assigned', '');

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('module natif absent (dev client périmé) : aucun abonnement, aucun crash', async () => {
    const load = jest.fn().mockResolvedValue(null);
    render(<PushRegistration bridge={bridge} os="android" loadNotifications={load} />);

    await waitFor(() => expect(load).toHaveBeenCalled());
    // L'enregistrement, lui, passe par le pont injecté et reste fonctionnel.
    await waitFor(() => expect(mockRegisterDevice).toHaveBeenCalled());
  });

  // Sans handler installé, expo-notifications avale les push reçus app ouverte : rien à l'écran,
  // alors que la même notification s'affiche en arrière-plan. Écart trouvé en validant TLX-84 sur
  // appareil — d'où une garde sur la décision d'affichage elle-même, pas seulement sur l'appel.
  it('push reçu app au premier plan : bannière + liste, sans badge', async () => {
    const notifs = fakeNotifications();
    render(<PushRegistration bridge={bridge} os="android" loadNotifications={notifs.load} />);
    await waitFor(() => expect(notifs.setNotificationHandler).toHaveBeenCalled());

    await expect(notifs.foregroundBehavior()).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      // L'app ne tient aucun compteur : un badge posé ici ne serait jamais remis à zéro.
      shouldSetBadge: false,
    });
  });

  it('web : aucune tentative d’enregistrement', async () => {
    const notifs = fakeNotifications();
    render(<PushRegistration bridge={bridge} os="web" loadNotifications={notifs.load} />);

    await waitFor(() => expect(notifs.subscribed).toBe(true));
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it('retire l’abonnement au démontage', async () => {
    const notifs = fakeNotifications();
    const view = render(
      <PushRegistration bridge={bridge} os="android" loadNotifications={notifs.load} />,
    );
    await waitFor(() => expect(notifs.subscribed).toBe(true));

    view.unmount();

    expect(notifs.remove).toHaveBeenCalled();
  });
});
