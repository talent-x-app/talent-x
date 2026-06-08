import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockRegister = jest.fn();
const mockReplace = jest.fn();
const mockSignIn = jest.fn();
const mockSetTokens = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  register: (...args: unknown[]) => mockRegister(...args),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
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

import RegisterScreen from './register';

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

function fillValidForm() {
  fireEvent.press(screen.getByTestId('register-role-coach'));
  fireEvent.changeText(screen.getByTestId('register-email'), 'coach@example.com');
  fireEvent.changeText(screen.getByTestId('register-password'), 'SecureP@ss123');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetTokens.mockResolvedValue(undefined);
  mockSignIn.mockResolvedValue(undefined);
});

describe('RegisterScreen (TLX-026)', () => {
  it('affiche le titre, le choix du rôle, les champs et le bouton', () => {
    render(<RegisterScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Créer un compte')).toBeOnTheScreen();
    expect(screen.getByTestId('register-role-coach')).toBeOnTheScreen();
    expect(screen.getByTestId('register-role-athlete')).toBeOnTheScreen();
    expect(screen.getByTestId('register-email')).toBeOnTheScreen();
    expect(screen.getByTestId('register-password')).toBeOnTheScreen();
    expect(screen.getByTestId('register-submit')).toBeOnTheScreen();
  });

  it('exige le choix du rôle avant tout appel API', () => {
    render(<RegisterScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('register-email'), 'coach@example.com');
    fireEvent.changeText(screen.getByTestId('register-password'), 'SecureP@ss123');
    fireEvent.press(screen.getByTestId('register-submit'));
    expect(screen.getByText('Choisis ton rôle pour continuer.')).toBeOnTheScreen();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('refuse un mot de passe trop court (< 8) sans appel API', () => {
    render(<RegisterScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('register-role-athlete'));
    fireEvent.changeText(screen.getByTestId('register-email'), 'a@e.fr');
    fireEvent.changeText(screen.getByTestId('register-password'), 'court');
    fireEvent.press(screen.getByTestId('register-submit'));
    expect(
      screen.getByText('Le mot de passe doit contenir au moins 8 caractères.'),
    ).toBeOnTheScreen();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('inscription réussie : envoie le rôle, persiste les jetons, ouvre la session, redirige', async () => {
    mockRegister.mockResolvedValue({ status: 201, data: SESSION });
    render(<RegisterScreen />, { wrapper: Wrapper });

    fillValidForm();
    fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(mockRegister).toHaveBeenCalledWith({
      email: 'coach@example.com',
      password: 'SecureP@ss123',
      role: 'coach',
      firstName: undefined,
      lastName: undefined,
    });
    expect(mockSetTokens).toHaveBeenCalledWith({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(mockSignIn).toHaveBeenCalledWith('coach');
  });

  it('e-mail déjà utilisé (409) : message d’erreur, pas de redirection', async () => {
    mockRegister.mockResolvedValue({ status: 409, data: { error: 'EMAIL_ALREADY_EXISTS' } });
    render(<RegisterScreen />, { wrapper: Wrapper });

    fillValidForm();
    fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() =>
      expect(screen.getByText('Un compte existe déjà avec cet e-mail.')).toBeOnTheScreen(),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockSetTokens).not.toHaveBeenCalled();
  });

  it('erreur serveur : toast d’erreur, pas de redirection', async () => {
    mockRegister.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<RegisterScreen />, { wrapper: Wrapper });

    fillValidForm();
    fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() => expect(mockShow).toHaveBeenCalled());
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger', title: 'Erreur serveur' }),
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
