import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListNotifications = jest.fn();
const mockReadAllNotifications = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listNotifications: (...a: unknown[]) => mockListNotifications(...a),
  readAllNotifications: (...a: unknown[]) => mockReadAllNotifications(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
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
});

describe('NotificationsScreen (TLX-111 — ADR-23)', () => {
  it('affiche le feed (libellés par type, point non-lu) et marque tout lu à l’ouverture', async () => {
    mockListNotifications.mockResolvedValue(page([UNREAD, READ], 1));
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notification-n-1')).toBeOnTheScreen());
    expect(screen.getByText('Nouvelle séance')).toBeOnTheScreen();
    expect(screen.getByText('Nouveau feedback')).toBeOnTheScreen();
    expect(screen.getByTestId('notification-n-1-unread')).toBeOnTheScreen();
    expect(screen.queryByTestId('notification-n-2-unread')).toBeNull();
    await waitFor(() => expect(mockReadAllNotifications).toHaveBeenCalledTimes(1));
  });

  it('ne marque rien quand tout est déjà lu', async () => {
    mockListNotifications.mockResolvedValue(page([READ], 0));
    render(<NotificationsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notification-n-2')).toBeOnTheScreen());
    expect(mockReadAllNotifications).not.toHaveBeenCalled();
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
});
