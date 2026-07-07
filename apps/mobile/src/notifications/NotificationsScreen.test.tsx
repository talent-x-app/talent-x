import { ThemeProvider, darkColors, darkTheme } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { type ReactNode, useState } from 'react';

const mockListNotifications = jest.fn();
const mockReadAllNotifications = jest.fn();
const mockReadNotification = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listNotifications: (...a: unknown[]) => mockListNotifications(...a),
  readAllNotifications: (...a: unknown[]) => mockReadAllNotifications(...a),
  readNotification: (...a: unknown[]) => mockReadNotification(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ role: 'athlete', isLoading: false }),
}));

import { NotificationsScreen } from './NotificationsScreen';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

/** Thème sombre forcé — assertions de contraste (TLX-151). */
function DarkWrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

function page(notifications: unknown[], unreadCount: number) {
  return {
    status: 200,
    data: {
      data: notifications,
      meta: { total: notifications.length, page: 1, limit: 50, hasNext: false },
      unreadCount,
    },
  };
}

const UNREAD = {
  id: 'n-1',
  type: 'session_assigned',
  resourceId: 'asg-1',
  createdAt: new Date().toISOString(),
};
const READ = {
  id: 'n-2',
  type: 'performance_feedback',
  resourceId: 'asg-2',
  readAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockReadAllNotifications.mockResolvedValue({ status: 200, data: { updated: 1 } });
  mockReadNotification.mockResolvedValue({ status: 200, data: {} });
});

describe('NotificationsScreen (TLX-111 — ADR-23)', () => {
  it('affiche le feed (libellés par type, point non-lu) SANS marquer tout lu à l’ouverture (TLX-189)', async () => {
    mockListNotifications.mockResolvedValue(page([UNREAD, READ], 1));
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notification-n-1')).toBeOnTheScreen());
    expect(screen.getByText('Nouvelle séance')).toBeOnTheScreen();
    expect(screen.getByText('Nouveau feedback')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-n-1-unread')).toBeOnTheScreen();
    expect(screen.queryByTestId('notification-n-2-unread')).toBeNull();
    // Cœur de TLX-189 : ouvrir le centre n'efface plus le pouls des non-lues.
    expect(mockReadAllNotifications).not.toHaveBeenCalled();
  });

  it('marque lue au tap (optimiste : point retiré) puis navigue (TLX-189)', async () => {
    mockListNotifications.mockResolvedValue(page([UNREAD], 1));
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notification-n-1-unread')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('notification-n-1'));
    await waitFor(() => expect(mockReadNotification).toHaveBeenCalledWith('n-1'));
    // Optimiste : le point non-lu disparaît sans attendre le serveur.
    await waitFor(() => expect(screen.queryByTestId('notification-n-1-unread')).toBeNull());
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(athlete)/session/[id]' }),
    );
  });

  it('tap sur une notification déjà lue : pas d’appel de lecture unitaire', async () => {
    mockListNotifications.mockResolvedValue(page([READ], 0));
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notification-n-2')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('notification-n-2'));
    expect(mockReadNotification).not.toHaveBeenCalled();
  });

  it('« Tout marquer lu » : action explicite, visible seulement avec des non-lues (TLX-189)', async () => {
    mockListNotifications.mockResolvedValue(page([UNREAD], 1));
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notifications-read-all')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('notifications-read-all'));
    await waitFor(() => expect(mockReadAllNotifications).toHaveBeenCalledTimes(1));
  });

  it('« Tout marquer lu » masqué sans non-lue', async () => {
    mockListNotifications.mockResolvedValue(page([READ], 0));
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notification-n-2')).toBeOnTheScreen());
    expect(screen.queryByTestId('notifications-read-all')).toBeNull();
  });

  it('rend une description nominative quand l’acteur est résolu, générique sinon (ADR-55)', async () => {
    mockListNotifications.mockResolvedValue(
      page(
        [
          {
            id: 'n-a',
            type: 'group_update',
            resourceId: 'g-1',
            actor: { id: 'a-9', displayName: 'Léa' },
            createdAt: new Date().toISOString(),
          },
          // Sans acteur → repli générique.
          {
            id: 'n-b',
            type: 'group_update',
            resourceId: 'g-2',
            createdAt: new Date().toISOString(),
          },
        ],
        0,
      ),
    );
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notification-n-a')).toBeOnTheScreen());
    expect(screen.getByText(/Léa a rejoint votre groupe\./)).toBeOnTheScreen();
    expect(screen.getByText(/Un athlète a rejoint votre groupe\./)).toBeOnTheScreen();
  });

  it('ne marque rien quand tout est déjà lu', async () => {
    mockListNotifications.mockResolvedValue(page([READ], 0));
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notification-n-2')).toBeOnTheScreen());
    expect(mockReadAllNotifications).not.toHaveBeenCalled();
  });

  it('revient en arrière au tap sur « Retour » (TLX-92)', async () => {
    mockListNotifications.mockResolvedValue(page([READ], 0));
    render(<NotificationsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('notifications-back')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('notifications-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('navigue vers la ressource selon le type et le rôle', async () => {
    mockListNotifications.mockResolvedValue(page([UNREAD], 1));
    render(<NotificationsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('notification-n-1')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('notification-n-1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(athlete)/session/[id]',
      params: { id: 'asg-1' },
    });
  });

  it('états vide et erreur', async () => {
    mockListNotifications.mockResolvedValue(page([], 0));
    render(<NotificationsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('notifications-empty')).toBeOnTheScreen());

    mockListNotifications.mockResolvedValue({ status: 500, data: {} });
    render(<NotificationsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('notifications-error')).toBeOnTheScreen());
  });

  it('description + date d’une notification en textSecondary — contraste AA (TLX-151)', async () => {
    mockListNotifications.mockResolvedValue(page([READ], 0));
    render(<NotificationsScreen />, { wrapper: DarkWrapper });
    await waitFor(() => expect(screen.getByTestId('notification-n-2')).toBeOnTheScreen());
    const meta = screen.getByText(/coach a commenté/);
    expect((StyleSheet.flatten(meta.props.style) as { color?: string }).color).toBe(
      darkColors.textSecondary,
    );
  });
});
