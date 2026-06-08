import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

const mockSetup = jest.fn();
const mockRestore = jest.fn();
const mockSetRole = jest.fn();
const mockClearRole = jest.fn();
const mockClearTokens = jest.fn();

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

function renderProvider() {
  return render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetup.mockResolvedValue(undefined);
  mockRestore.mockResolvedValue(null);
  mockSetRole.mockResolvedValue(undefined);
  mockClearRole.mockResolvedValue(undefined);
  mockClearTokens.mockResolvedValue(undefined);
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
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(mockClearRole).toHaveBeenCalledTimes(1);
  });
});
