import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetMe = jest.fn();
const mockUpdateMe = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockSignOut = jest.fn();
const mockShow = jest.fn();
const mockListNotifications = jest.fn();
const mockGetPreferences = jest.fn();
const mockUpdatePreferences = jest.fn();
const mockGetConsents = jest.fn();
const mockUpdateConsent = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getMe: (...args: unknown[]) => mockGetMe(...args),
  updateMe: (...args: unknown[]) => mockUpdateMe(...args),
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  getNotificationPreferences: (...args: unknown[]) => mockGetPreferences(...args),
  updateNotificationPreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
  // PrivacySection (TLX-106) est rendu par ProfileScreen : on stub ses appels.
  getConsents: (...args: unknown[]) => mockGetConsents(...args),
  updateConsent: (...args: unknown[]) => mockUpdateConsent(...args),
  requestExport: jest.fn(),
  getExport: jest.fn(),
  deleteMe: jest.fn(),
  ConsentType: {
    data_processing: 'data_processing',
    coach_access: 'coach_access',
    marketing: 'marketing',
  },
  JobStatus: { pending: 'pending', processing: 'processing', ready: 'ready', failed: 'failed' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace, push: mockPush }) }));
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({
    signOut: mockSignOut,
    role: 'athlete',
    isLoading: false,
    signIn: jest.fn(),
  }),
}));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur serveur', description: 'Réessayez.' }),
}));

import { ProfileScreen } from './ProfileScreen';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

const USER = {
  id: 'u1',
  email: 'ana@example.com',
  role: 'athlete' as const,
  firstName: 'Ana',
  lastName: 'Athl',
  sport: '200m',
  bio: 'Sprinteuse',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockListNotifications.mockResolvedValue({
    status: 200,
    data: {
      data: [],
      meta: { total: 0, page: 1, limit: 50, hasNext: false },
      unreadCount: 2,
    },
  });
  mockGetPreferences.mockResolvedValue({
    status: 200,
    data: {
      sessionAssigned: true,
      performanceFeedback: true,
      groupUpdates: true,
      marketing: false,
    },
  });
  mockGetConsents.mockResolvedValue({
    status: 200,
    data: { data: [{ type: 'data_processing', granted: true }] },
  });
});

describe('ProfileScreen (TLX-042)', () => {
  it('charge puis affiche le profil (nom, e-mail, initiales)', async () => {
    mockGetMe.mockResolvedValue({ status: 200, data: USER });
    render(<ProfileScreen />, { wrapper: Wrapper });

    expect(screen.getByTestId('profile-loading')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('profile-name')).toBeOnTheScreen());
    expect(screen.getByText('Ana Athl')).toBeOnTheScreen();
    expect(screen.getByText('ana@example.com')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-initials')).toHaveTextContent('AA');
  });

  it('affiche le libellé de rôle « Coach » pour un coach (C-11 réutilise l’écran)', async () => {
    mockGetMe.mockResolvedValue({
      status: 200,
      data: { ...USER, role: 'coach', sport: undefined, firstName: 'Marc', lastName: 'Caron' },
    });
    render(<ProfileScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('profile-name')).toBeOnTheScreen());
    expect(screen.getByText('Marc Caron')).toBeOnTheScreen();
    expect(screen.getByText('Coach')).toBeOnTheScreen();
  });

  it('entrée Notifications (badge non-lus) + section préférences (TLX-111)', async () => {
    mockGetMe.mockResolvedValue({ status: 200, data: USER });
    render(<ProfileScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('profile-notifications-link')).toBeOnTheScreen());
    await waitFor(() =>
      expect(screen.getByTestId('profile-notifications-badge')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('profile-notifications-badge')).toHaveTextContent('2');
    await waitFor(() =>
      expect(screen.getByTestId('notification-pref-sessionAssigned')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByTestId('profile-notifications-link'));
    expect(mockPush).toHaveBeenCalledWith('/(athlete)/notifications');
  });

  it('état erreur : message + réessai relance la requête', async () => {
    mockGetMe.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<ProfileScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('profile-error')).toBeOnTheScreen());

    mockGetMe.mockResolvedValueOnce({ status: 200, data: USER });
    fireEvent.press(screen.getByTestId('profile-retry'));
    await waitFor(() => expect(screen.getByTestId('profile-name')).toBeOnTheScreen());
  });

  it('édition : enregistre les champs (trim) via updateMe puis revient en lecture', async () => {
    mockGetMe.mockResolvedValue({ status: 200, data: USER });
    mockUpdateMe.mockResolvedValue({ status: 200, data: { ...USER, sport: '400m' } });
    render(<ProfileScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('profile-edit')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('profile-edit'));

    fireEvent.changeText(screen.getByTestId('profile-sport'), '  400m  ');
    fireEvent.press(screen.getByTestId('profile-save'));

    await waitFor(() => expect(mockUpdateMe).toHaveBeenCalled());
    expect(mockUpdateMe).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: 'Ana',
        lastName: 'Athl',
        sport: '400m',
        bio: 'Sprinteuse',
      }),
    );
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: 'Profil mis à jour' }),
    );
    // Retour en mode lecture : le bouton « Modifier » réapparaît.
    await waitFor(() => expect(screen.getByTestId('profile-edit')).toBeOnTheScreen());
  });

  it('déconnexion : signOut puis redirige explicitement vers le login (TLX-90)', async () => {
    mockGetMe.mockResolvedValue({ status: 200, data: USER });
    render(<ProfileScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('profile-logout')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('profile-logout'));

    // Redirection vers '/(auth)/login' et non '/' : passer par '/' re-dériverait
    // le rôle du contexte pas encore flushé et nous garderait connectés.
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'));
    expect(mockSignOut).toHaveBeenCalled();
  });
});
