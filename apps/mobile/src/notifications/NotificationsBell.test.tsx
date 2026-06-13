import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListNotifications = jest.fn();
const mockPush = jest.fn();
let mockRole: 'athlete' | 'coach' = 'athlete';

jest.mock('@talent-x/api-client', () => ({
  listNotifications: (...a: unknown[]) => mockListNotifications(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ role: mockRole, isLoading: false, signIn: jest.fn(), signOut: jest.fn() }),
}));

import { NotificationsBell } from './NotificationsBell';

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

function feed(unreadCount: number) {
  return { status: 200, data: { data: [], unreadCount, meta: { total: 0, page: 1, limit: 50 } } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRole = 'athlete';
});

describe('NotificationsBell (TLX-92)', () => {
  it('masque le badge quand aucune non-lue', async () => {
    mockListNotifications.mockResolvedValue(feed(0));
    render(<NotificationsBell />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('notifications-bell')).toBeOnTheScreen());
    expect(screen.queryByTestId('notifications-bell-badge')).toBeNull();
  });

  it('affiche le compte de non-lues', async () => {
    mockListNotifications.mockResolvedValue(feed(4));
    render(<NotificationsBell />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('notifications-bell-badge')).toHaveTextContent('4'),
    );
  });

  it('plafonne le badge à « 9+ »', async () => {
    mockListNotifications.mockResolvedValue(feed(25));
    render(<NotificationsBell />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('notifications-bell-badge')).toHaveTextContent('9+'),
    );
  });

  it('ouvre le centre athlète au tap', async () => {
    mockListNotifications.mockResolvedValue(feed(0));
    render(<NotificationsBell />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('notifications-bell')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('notifications-bell'));
    expect(mockPush).toHaveBeenCalledWith('/(athlete)/notifications');
  });

  it('ouvre le centre coach selon le rôle', async () => {
    mockRole = 'coach';
    mockListNotifications.mockResolvedValue(feed(0));
    render(<NotificationsBell />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('notifications-bell')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('notifications-bell'));
    expect(mockPush).toHaveBeenCalledWith('/(coach)/notifications');
  });

  it('reste affichée (sans badge) si le feed échoue', async () => {
    mockListNotifications.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<NotificationsBell />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('notifications-bell')).toBeOnTheScreen());
    expect(screen.queryByTestId('notifications-bell-badge')).toBeNull();
  });
});
