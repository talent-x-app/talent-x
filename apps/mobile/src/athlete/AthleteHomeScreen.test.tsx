import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetMe = jest.fn();
const mockGetMyGroups = jest.fn();
const mockListAssignments = jest.fn();
const mockListNotifications = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getMe: (...a: unknown[]) => mockGetMe(...a),
  getMyGroups: (...a: unknown[]) => mockGetMyGroups(...a),
  listAssignments: (...a: unknown[]) => mockListAssignments(...a),
  listNotifications: (...a: unknown[]) => mockListNotifications(...a),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ role: 'athlete', isLoading: false, signIn: jest.fn(), signOut: jest.fn() }),
}));

import { AthleteHomeScreen } from './AthleteHomeScreen';

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

const ME = {
  id: 'u-1',
  email: 'awa@ex.test',
  role: 'athlete',
  firstName: 'Awa',
  lastName: 'Traoré',
};
const HAS_GROUP = {
  status: 200,
  data: { data: [{ id: 'g-1', name: 'Sprint', memberCount: 2, coach: {} }] },
};
const NO_GROUP = { status: 200, data: { data: [] } };

function assignment(id: string, status: string, dueDate?: string) {
  return {
    id,
    status,
    dueDate,
    athleteId: 'u-1',
    session: { title: `Séance ${id}`, exercises: { items: [] } },
  };
}

/** Date du jour (UTC) moins `days` jours, au format date du contrat. */
function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMe.mockResolvedValue({ status: 200, data: ME });
  mockGetMyGroups.mockResolvedValue(HAS_GROUP);
  mockListNotifications.mockResolvedValue({
    status: 200,
    data: { data: [], unreadCount: 0, meta: { total: 0, page: 1, limit: 50 } },
  });
});

describe('AthleteHomeScreen (A-01, TLX-089)', () => {
  it('salue par le prénom et liste les séances à faire', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [assignment('s1', 'assigned', '2026-06-12T00:00:00Z')] },
    });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Bonjour, Awa')).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByTestId('home-todo-s1')).toBeOnTheScreen());
  });

  it('ouvre le détail au tap sur une séance à faire', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [assignment('s1', 'assigned', '2026-06-12T00:00:00Z')] },
    });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('home-todo-s1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-todo-s1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(athlete)/session/[id]', params: { id: 's1' } }),
    );
  });

  it('affiche « Voir toutes mes séances » au-delà de 3 à faire', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          assignment('a', 'assigned', '2026-06-11T00:00:00Z'),
          assignment('b', 'assigned', '2026-06-12T00:00:00Z'),
          assignment('c', 'assigned', '2026-06-13T00:00:00Z'),
          assignment('d', 'assigned', '2026-06-14T00:00:00Z'),
        ],
      },
    });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('home-see-all-sessions')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-see-all-sessions'));
    expect(mockPush).toHaveBeenCalledWith('/(athlete)/sessions');
  });

  it('propose de rejoindre un groupe quand non rattaché', async () => {
    mockGetMyGroups.mockResolvedValue(NO_GROUP);
    mockListAssignments.mockResolvedValue({ status: 200, data: { data: [] } });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('home-join-group')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-join-group-cta'));
    expect(mockPush).toHaveBeenCalledWith('/(athlete)/group/join');
  });

  it('état positif quand des séances existent mais rien à faire', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [assignment('s1', 'completed', '2026-06-10T00:00:00Z')] },
    });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('home-all-done')).toBeOnTheScreen());
  });

  it('met en avant la série d’assiduité quand la semaine est complète (TLX-115)', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [assignment('s1', 'completed', daysAgo(0))] },
    });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('home-streak-badge')).toBeOnTheScreen());
    expect(screen.getByTestId('home-streak-badge')).toHaveTextContent(/1 semaine d/);
  });

  it('aucune pastille de série sans semaine complète', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: { data: [] } });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('home-no-sessions')).toBeOnTheScreen());
    expect(screen.queryByTestId('home-streak-badge')).toBeNull();
  });

  it('état vide quand aucune séance affectée', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: { data: [] } });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('home-no-sessions')).toBeOnTheScreen());
  });

  it('état erreur + réessai', async () => {
    mockListAssignments.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('home-error')).toBeOnTheScreen());

    mockListAssignments.mockResolvedValueOnce({
      status: 200,
      data: { data: [assignment('s1', 'assigned', '2026-06-12T00:00:00Z')] },
    });
    fireEvent.press(screen.getByTestId('home-retry'));
    await waitFor(() => expect(screen.getByTestId('home-todo-s1')).toBeOnTheScreen());
  });

  it('affiche la cloche de notifications avec badge de non-lues et ouvre le centre (TLX-92)', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: { data: [] } });
    mockListNotifications.mockResolvedValue({
      status: 200,
      data: { data: [], unreadCount: 3, meta: { total: 0, page: 1, limit: 50 } },
    });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notifications-bell')).toBeOnTheScreen());
    await waitFor(() =>
      expect(screen.getByTestId('notifications-bell-badge')).toHaveTextContent('3'),
    );
    fireEvent.press(screen.getByTestId('notifications-bell'));
    expect(mockPush).toHaveBeenCalledWith('/(athlete)/notifications');
  });

  it('raccourcis vers calendrier et progression', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: { data: [] } });
    render(<AthleteHomeScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('home-shortcut-calendar')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('home-shortcut-calendar'));
    expect(mockPush).toHaveBeenCalledWith('/(athlete)/calendar');
    fireEvent.press(screen.getByTestId('home-shortcut-progress'));
    expect(mockPush).toHaveBeenCalledWith('/(athlete)/progress');
  });
});
