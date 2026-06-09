import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListAssignments = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listAssignments: (...args: unknown[]) => mockListAssignments(...args),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { AthleteSessionsScreen } from './AthleteSessionsScreen';

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

const PAGE = {
  data: [
    {
      id: 'as-1',
      sessionId: 's-1',
      athleteId: 'me',
      status: 'assigned',
      dueDate: '2026-06-12T00:00:00.000Z',
      session: {
        id: 's-1',
        title: 'Haut du corps',
        status: 'published',
        coachId: 'c-1',
        exercises: {
          items: [
            { name: 'Développé', order: 0 },
            { name: 'Tractions', order: 1 },
          ],
        },
      },
    },
    {
      id: 'as-2',
      sessionId: 's-2',
      athleteId: 'me',
      status: 'completed',
      session: {
        id: 's-2',
        title: 'Cardio',
        status: 'published',
        coachId: 'c-1',
        exercises: { items: [{ name: 'Intervalles', order: 0 }] },
      },
    },
  ],
  meta: { total: 2, page: 1, limit: 20 },
};

beforeEach(() => jest.clearAllMocks());

describe('AthleteSessionsScreen (TLX-065 / A-02)', () => {
  it('liste les séances affectées avec leur statut', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteSessionsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Haut du corps')).toBeOnTheScreen());
    expect(screen.getByText('Cardio')).toBeOnTheScreen();
    expect(screen.getByTestId('sessions-count')).toHaveTextContent('2 séances affectées');
    expect(screen.getByTestId('assignment-status-assigned')).toHaveTextContent('À faire');
    expect(screen.getByTestId('assignment-status-completed')).toHaveTextContent('Réalisée');
  });

  it('trie les séances à faire avant les terminées', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteSessionsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('session-item-as-1')).toBeOnTheScreen());
    const items = screen.getAllByTestId(/^session-item-/);
    expect(items[0].props.testID).toBe('session-item-as-1'); // assigned avant completed
    expect(items[1].props.testID).toBe('session-item-as-2');
  });

  it('ouvre le détail au tap sur une séance', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteSessionsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('session-item-as-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('session-item-as-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ id: 'as-1' }) }),
    );
  });

  it('état vide quand aucune séance', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    });
    render(<AthleteSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('sessions-empty')).toBeOnTheScreen());
  });

  it('état erreur + réessai', async () => {
    mockListAssignments.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<AthleteSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('sessions-error')).toBeOnTheScreen());

    mockListAssignments.mockResolvedValueOnce({ status: 200, data: PAGE });
    fireEvent.press(screen.getByTestId('sessions-retry'));
    await waitFor(() => expect(screen.getByText('Haut du corps')).toBeOnTheScreen());
  });
});
