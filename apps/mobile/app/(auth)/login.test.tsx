import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockLogin = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSignIn = jest.fn();
const mockSetTokens = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));
jest.mock('../../src/auth/token-store', () => ({
  setTokens: (...args: unknown[]) => mockSetTokens(...args),
}));
jest.mock('../../src/auth/SessionProvider', () => ({
  useSession: () => ({ signIn: mockSignIn, role: null, isLoading: false, signOut: jest.fn() }),
}));
jest.mock('../../src/feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur serveur', description: 'Réessayez.' }),
}));

import LoginScreen from './login';

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

const SESSION = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
  user: { id: 'u1', email: 'coach@example.com', role: 'coach' as const },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSetTokens.mockResolvedValue(undefined);
  mockSignIn.mockResolvedValue(undefined);
});

describe('LoginScreen (TLX-025)', () => {
  it('affiche le titre, les champs et le bouton', () => {
    render(<LoginScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Talent-X')).toBeOnTheScreen();
    expect(screen.getByTestId('login-email')).toBeOnTheScreen();
    expect(screen.getByTestId('login-password')).toBeOnTheScreen();
    expect(screen.getByTestId('login-submit')).toBeOnTheScreen();
  });

  it('valide la saisie : champs vides → erreur, pas d’appel API', () => {
    render(<LoginScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('login-submit'));
    expect(screen.getByText('Renseigne ton e-mail et ton mot de passe.')).toBeOnTheScreen();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('connexion réussie : persiste les jetons, ouvre la session, redirige', async () => {
    mockLogin.mockResolvedValue({ status: 200, data: SESSION });
    render(<LoginScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('login-email'), 'coach@example.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'SecureP@ss123');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockLogin).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'SecureP@ss123',
    });
    expect(mockSetTokens).toHaveBeenCalledWith({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(mockSignIn).toHaveBeenCalledWith('coach');
  });

  it('identifiants invalides (401) : message d’erreur, pas de redirection', async () => {
    mockLogin.mockResolvedValue({ status: 401, data: { error: 'INVALID_CREDENTIALS' } });
    render(<LoginScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('login-email'), 'coach@example.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'wrong');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() =>
      expect(screen.getByText('E-mail ou mot de passe incorrect.')).toBeOnTheScreen(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetTokens).not.toHaveBeenCalled();
  });

  it('erreur serveur : toast d’erreur, pas de redirection', async () => {
    mockLogin.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<LoginScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('login-email'), 'coach@example.com');
    fireEvent.changeText(screen.getByTestId('login-password'), 'SecureP@ss123');
    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mockShow).toHaveBeenCalled());
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger', title: 'Erreur serveur' }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
