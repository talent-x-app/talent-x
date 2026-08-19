import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

const mockSetup = jest.fn();
const mockRestore = jest.fn();
const mockSetRole = jest.fn();
const mockClearRole = jest.fn();
const mockClearTokens = jest.fn();
const mockRevokeRegisteredDevice = jest.fn();
const mockForgetDeviceRegistration = jest.fn();

jest.mock('../notifications/push-registration', () => ({
  revokeRegisteredDevice: () => mockRevokeRegisteredDevice(),
  forgetDeviceRegistration: () => mockForgetDeviceRegistration(),
}));
jest.mock('../data/setup', () => ({ setupApiClient: () => mockSetup() }));
jest.mock('./auth', () => ({ restoreSession: () => mockRestore() }));
jest.mock('./session-store', () => ({
  setRole: (...args: unknown[]) => mockSetRole(...args),
  clearRole: () => mockClearRole(),
}));
jest.mock('./token-store', () => ({ clearTokens: () => mockClearTokens() }));

import { SessionProvider, useSession } from './SessionProvider';

function Probe() {
  const { role, isLoading, signIn, signOut } = useSession();
  return (
    <>
      <Text testID="state">{isLoading ? 'loading' : `role:${role ?? 'none'}`}</Text>
      <Pressable testID="signin" onPress={() => void signIn('coach')}>
        <Text>in</Text>
      </Pressable>
      <Pressable testID="signout" onPress={() => void signOut()}>
        <Text>out</Text>
      </Pressable>
    </>
  );
}

/**
 * Le `QueryClient` est fourni **au-dessus** du provider, comme dans `app/_layout.tsx` —
 * c'est précisément parce qu'il vit plus haut qu'il survit aux déconnexions (TLX-242).
 * Le client est rendu à l'appelant pour que les tests observent son cache.
 */
function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

/** Donnée d'un compte laissée dans le cache — ce qui fuyait vers le compte suivant. */
function seedCache(queryClient: QueryClient) {
  queryClient.setQueryData(['assignments'], [{ id: 'asg-1', title: 'Séance du compte A' }]);
  queryClient.setQueryData(['notifications', 'me'], { data: [], unreadCount: 3 });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetup.mockResolvedValue(undefined);
  mockRestore.mockResolvedValue(null);
  mockSetRole.mockResolvedValue(undefined);
  mockClearRole.mockResolvedValue(undefined);
  mockClearTokens.mockResolvedValue(undefined);
  mockRevokeRegisteredDevice.mockResolvedValue(undefined);
  mockForgetDeviceRegistration.mockResolvedValue(undefined);
});

describe('SessionProvider (TLX-027)', () => {
  it('restaure la session au démarrage (config + jetons avant restauration)', async () => {
    mockRestore.mockResolvedValue('coach');
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:coach'));
    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(mockRestore).toHaveBeenCalledTimes(1);
  });

  it('aucune session valide : rôle nul une fois le chargement terminé', async () => {
    mockRestore.mockResolvedValue(null);
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:none'));
  });

  it('signOut efface jetons + rôle et réinitialise la session', async () => {
    mockRestore.mockResolvedValue('coach');
    renderProvider();

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:coach'));
    fireEvent.press(screen.getByTestId('signout'));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:none'));
    expect(mockRevokeRegisteredDevice).toHaveBeenCalledTimes(1);
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(mockClearRole).toHaveBeenCalledTimes(1);
  });

  it('signIn oublie la mémoire d’enregistrement push avant d’exposer le rôle', async () => {
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:none'));

    fireEvent.press(screen.getByTestId('signin'));

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:coach'));
    expect(mockForgetDeviceRegistration).toHaveBeenCalledTimes(1);
    // L'ordre est le contrat : c'est la pose du rôle qui déclenche la tentative
    // d'enregistrement de <PushRegistration> — l'oubli doit être déjà effectif.
    expect(mockForgetDeviceRegistration.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetRole.mock.invocationCallOrder[0],
    );
  });

  /**
   * TLX-242 — confidentialité. Le `QueryClient` est créé une fois à la racine, au-dessus de
   * ce provider : il survivait à toutes les déconnexions, et le compte suivant voyait les
   * données du précédent. La fenêtre n'était pas de 30 s mais de 5 min — `staleTime` sert la
   * donnée telle quelle, puis `gcTime` (défaut) la garde affichée pendant le rechargement.
   */
  describe('purge du cache entre deux comptes (TLX-242)', () => {
    it('signOut vide le cache serveur', async () => {
      mockRestore.mockResolvedValue('athlete');
      const { queryClient } = renderProvider();
      await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:athlete'));
      seedCache(queryClient);

      fireEvent.press(screen.getByTestId('signout'));

      await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:none'));
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });

    it('signIn vide le cache : une session peut mourir sans passer par signOut', async () => {
      // Refresh expiré → les jetons sont effacés et l'app retombe sur l'écran de connexion
      // sans que `signOut` soit appelé. Le cache du compte précédent est alors intact : c'est
      // la connexion suivante qui doit s'en débarrasser. Même raison que
      // `forgetDeviceRegistration()` juste à côté (TLX-226), une couche au-dessus.
      const { queryClient } = renderProvider();
      await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:none'));
      seedCache(queryClient);

      fireEvent.press(screen.getByTestId('signin'));

      await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:coach'));
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    });

    it('la purge précède la pose du rôle : rien du compte précédent n’est lisible ensuite', async () => {
      const { queryClient } = renderProvider();
      await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('role:none'));
      seedCache(queryClient);

      fireEvent.press(screen.getByTestId('signin'));

      // C'est la pose du rôle qui laisse les écrans du compte se monter et lire le cache :
      // purger après elle rouvrirait la fenêtre que ce correctif ferme.
      await waitFor(() => expect(mockSetRole).toHaveBeenCalled());
      expect(queryClient.getQueryData(['assignments'])).toBeUndefined();
    });
  });
});
