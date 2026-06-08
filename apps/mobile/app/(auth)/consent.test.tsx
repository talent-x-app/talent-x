import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockUpdateConsent = jest.fn();
const mockReplace = jest.fn();
const mockSignIn = jest.fn();
const mockShow = jest.fn();
let mockParams: { role?: string } = { role: 'athlete' };

jest.mock('@talent-x/api-client', () => ({
  updateConsent: (...args: unknown[]) => mockUpdateConsent(...args),
  // Réexpose l'enum consommée par l'écran (le mock remplace tout le module).
  ConsentType: {
    data_processing: 'data_processing',
    coach_access: 'coach_access',
    marketing: 'marketing',
  },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../src/auth/SessionProvider', () => ({
  useSession: () => ({ signIn: mockSignIn, role: null, isLoading: false, signOut: jest.fn() }),
}));
jest.mock('../../src/feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur serveur', description: 'Réessayez.' }),
}));

import ConsentScreen from './consent';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { mutations: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { role: 'athlete' };
  mockSignIn.mockResolvedValue(undefined);
  mockUpdateConsent.mockResolvedValue({ status: 200, data: {} });
});

describe('ConsentScreen (TLX-030)', () => {
  it('athlète : affiche les 3 consentements, tous décochés (opt-in)', () => {
    render(<ConsentScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Tes consentements')).toBeOnTheScreen();
    for (const type of ['data_processing', 'coach_access', 'marketing']) {
      const sw = screen.getByTestId(`consent-switch-${type}`);
      expect(sw).toBeOnTheScreen();
      expect(sw.props.value).toBe(false);
    }
  });

  it('coach : n’affiche que le consentement marketing (pas d’accès coach)', () => {
    mockParams = { role: 'coach' };
    render(<ConsentScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('consent-switch-marketing')).toBeOnTheScreen();
    expect(screen.queryByTestId('consent-switch-coach_access')).toBeNull();
    expect(screen.queryByTestId('consent-switch-data_processing')).toBeNull();
  });

  it('continuer : enregistre chaque choix, ouvre la session, redirige', async () => {
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent(screen.getByTestId('consent-switch-data_processing'), 'valueChange', true);
    fireEvent(screen.getByTestId('consent-switch-coach_access'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockUpdateConsent).toHaveBeenCalledTimes(3);
    expect(mockUpdateConsent).toHaveBeenCalledWith({ type: 'data_processing', granted: true });
    expect(mockUpdateConsent).toHaveBeenCalledWith({ type: 'coach_access', granted: true });
    expect(mockUpdateConsent).toHaveBeenCalledWith({ type: 'marketing', granted: false });
    expect(mockSignIn).toHaveBeenCalledWith('athlete');
  });

  it('échec d’enregistrement : toast d’erreur, pas de session ni de redirection', async () => {
    mockUpdateConsent.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<ConsentScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('consent-submit'));

    await waitFor(() => expect(mockShow).toHaveBeenCalled());
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger', title: 'Erreur serveur' }),
    );
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
