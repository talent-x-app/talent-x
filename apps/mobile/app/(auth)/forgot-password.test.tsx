import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockForgotPassword = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}));
jest.mock('../../src/feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur serveur', description: 'Réessayez.' }),
}));

import ForgotPasswordScreen from './forgot-password';

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
});

describe('ForgotPasswordScreen (TLX-234)', () => {
  it('affiche le champ e-mail et le bouton d’envoi', () => {
    render(<ForgotPasswordScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Mot de passe oublié')).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-password-email')).toBeOnTheScreen();
    expect(screen.getByTestId('forgot-password-submit')).toBeOnTheScreen();
  });

  it('champ vide : erreur de saisie, aucun appel API', () => {
    render(<ForgotPasswordScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('forgot-password-submit'));

    expect(screen.getByText('Renseigne ton e-mail.')).toBeOnTheScreen();
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  it('demande acceptée (202) : confirmation NEUTRE, sans révéler que le compte existe', async () => {
    mockForgotPassword.mockResolvedValue({ status: 202 });
    render(<ForgotPasswordScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('forgot-password-email'), ' coach@example.com ');
    fireEvent.press(screen.getByTestId('forgot-password-submit'));

    await waitFor(() => expect(screen.getByTestId('forgot-password-sent')).toBeOnTheScreen());
    // Le 202 anti-énumération du serveur ne vaut rien si l'écran, lui, affirme l'envoi.
    expect(screen.getByText(/Si un compte existe pour cette adresse/)).toBeOnTheScreen();
    expect(mockForgotPassword).toHaveBeenCalledWith({ email: 'coach@example.com' });
    // Le formulaire disparaît : rien ne pousse à renvoyer en boucle (chaque appel enfile un email).
    expect(screen.queryByTestId('forgot-password-submit')).toBeNull();
  });

  it('adresse invalide (422) : message de saisie, pas de confirmation', async () => {
    mockForgotPassword.mockResolvedValue({ status: 422, data: { error: 'VALIDATION_FAILED' } });
    render(<ForgotPasswordScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('forgot-password-email'), 'pas-un-email');
    fireEvent.press(screen.getByTestId('forgot-password-submit'));

    await waitFor(() =>
      expect(screen.getByText('Vérifie l’adresse e-mail saisie.')).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('forgot-password-sent')).toBeNull();
  });

  // Le rate limiting de TLX-233 vise précisément cette route : chaque appel enfile un email.
  it('trop de demandes (429) : message d’attente explicite', async () => {
    mockForgotPassword.mockResolvedValue({ status: 429, data: { error: 'TOO_MANY_REQUESTS' } });
    render(<ForgotPasswordScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('forgot-password-email'), 'coach@example.com');
    fireEvent.press(screen.getByTestId('forgot-password-submit'));

    await waitFor(() =>
      expect(
        screen.getByText('Trop de demandes. Réessaie dans quelques minutes.'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByTestId('forgot-password-sent')).toBeNull();
  });

  it('erreur serveur : toast, pas de confirmation trompeuse', async () => {
    mockForgotPassword.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<ForgotPasswordScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('forgot-password-email'), 'coach@example.com');
    fireEvent.press(screen.getByTestId('forgot-password-submit'));

    await waitFor(() => expect(mockShow).toHaveBeenCalled());
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'danger', title: 'Erreur serveur' }),
    );
    expect(screen.queryByTestId('forgot-password-sent')).toBeNull();
  });

  it('retour à la connexion', () => {
    render(<ForgotPasswordScreen />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('forgot-password-back'));

    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });
});
