import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListSessions = jest.fn();
const mockListCompetitions = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listSessions: (...args: unknown[]) => mockListSessions(...args),
  listCompetitions: (...args: unknown[]) => mockListCompetitions(...args),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
  SessionStatus: { draft: 'draft', published: 'published', archived: 'archived' },
  CompetitionStatus: { draft: 'draft', published: 'published', cancelled: 'cancelled' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const EMPTY_COMPETITIONS = {
  status: 200 as const,
  data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
};

import { CoachCalendarScreen } from './CoachCalendarScreen';

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

// Séance sans date planifiée → section « Sans date », visible quelle que soit la semaine courante.
const PAGE = {
  data: [
    {
      id: 's-1',
      title: 'Côtes N111',
      status: 'published',
      coachId: 'me',
      exercises: { items: [] },
    },
  ],
  meta: { total: 1, page: 1, limit: 20 },
};

beforeEach(() => {
  jest.clearAllMocks();
  // Par défaut, aucune compétition : les tests séances restent inchangés (ADR-24 §5).
  mockListCompetitions.mockResolvedValue(EMPTY_COMPETITIONS);
});

describe('CoachCalendarScreen (TLX-100 / C-09)', () => {
  it('rend le calendrier avec les séances du coach dérivées', async () => {
    mockListSessions.mockResolvedValue({ status: 200, data: PAGE });
    render(<CoachCalendarScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('calendar-undated-s-1')).toBeOnTheScreen());
    expect(screen.getByText('Côtes N111')).toBeOnTheScreen();
    expect(screen.getByText('Publiée')).toBeOnTheScreen();
  });

  it('ouvre le constructeur de séance au tap', async () => {
    mockListSessions.mockResolvedValue({ status: 200, data: PAGE });
    render(<CoachCalendarScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('calendar-undated-s-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('calendar-undated-s-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/session/[id]',
        params: expect.objectContaining({ id: 's-1' }),
      }),
    );
  });

  it('état vide quand aucune séance', async () => {
    mockListSessions.mockResolvedValue({
      status: 200,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    });
    render(<CoachCalendarScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('calendar-empty')).toBeOnTheScreen());
  });

  it('état erreur + réessai', async () => {
    mockListSessions.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachCalendarScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('calendar-error')).toBeOnTheScreen());

    mockListSessions.mockResolvedValueOnce({ status: 200, data: PAGE });
    fireEvent.press(screen.getByTestId('calendar-retry'));
    await waitFor(() => expect(screen.getByTestId('calendar-undated-s-1')).toBeOnTheScreen());
  });

  it('fusionne les compétitions et ouvre l’édition au tap (ADR-24 §5)', async () => {
    mockListSessions.mockResolvedValue({
      status: 200,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    });
    mockListCompetitions.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 'k-1',
            coachId: 'me',
            name: 'Meeting de printemps',
            startDate: null,
            status: 'published',
          },
        ],
        meta: { total: 1, page: 1, limit: 20 },
      },
    });
    render(<CoachCalendarScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('calendar-undated-k-1')).toBeOnTheScreen());
    expect(screen.getByText('Meeting de printemps')).toBeOnTheScreen();
    expect(screen.getByText('Compétition · Publiée')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('calendar-undated-k-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/competition/[id]',
        params: expect.objectContaining({ id: 'k-1' }),
      }),
    );
  });
});
