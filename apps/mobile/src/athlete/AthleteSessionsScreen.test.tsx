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

describe('AthleteSessionsScreen (TLX-065 / A-02 — onglets ADR-53)', () => {
  it('onglets À venir / Passées avec compteurs ; défaut = À venir', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteSessionsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('session-item-as-1')).toBeOnTheScreen());
    // Compteurs par onglet (1 à venir, 1 passée).
    expect(screen.getByTestId('sessions-filter-upcoming')).toHaveTextContent('À venir 1');
    expect(screen.getByTestId('sessions-filter-past')).toHaveTextContent('Passées 1');
    // Défaut À venir : la séance assignée est visible, la terminée non.
    expect(screen.getByText('Haut du corps')).toBeOnTheScreen();
    expect(screen.queryByTestId('session-item-as-2')).toBeNull();
    expect(screen.getByTestId('assignment-status-assigned')).toHaveTextContent('À faire');
  });

  it('onglet Passées affiche les séances réalisées', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('sessions-filter-past')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('sessions-filter-past'));
    expect(screen.getByTestId('session-item-as-2')).toBeOnTheScreen();
    expect(screen.getByText('Cardio')).toBeOnTheScreen();
    expect(screen.queryByTestId('session-item-as-1')).toBeNull();
    expect(screen.getByTestId('assignment-status-completed')).toHaveTextContent('Réalisée');
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

  it('recherche dans l’onglet courant + sans correspondance (TLX-117)', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('session-item-as-1')).toBeOnTheScreen());

    // Onglet À venir : « haut » matche as-1.
    fireEvent.changeText(screen.getByTestId('sessions-search'), 'haut');
    expect(screen.getByTestId('session-item-as-1')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('sessions-search'), 'zzz');
    expect(screen.getByTestId('sessions-no-match')).toBeOnTheScreen();
  });
});
