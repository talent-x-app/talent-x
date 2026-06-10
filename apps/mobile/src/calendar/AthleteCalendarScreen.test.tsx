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
  SessionStatus: { draft: 'draft', published: 'published', archived: 'archived' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { AthleteCalendarScreen } from './AthleteCalendarScreen';

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

// Une affectation sans date (rendue dans « Sans date », visible quelle que soit la semaine
// courante) garantit un test déterministe indépendant de la date réelle d'exécution.
const PAGE = {
  data: [
    {
      id: 'as-1',
      sessionId: 's-1',
      athleteId: 'me',
      status: 'assigned',
      session: {
        id: 's-1',
        title: 'Sprint 60m',
        status: 'published',
        coachId: 'c-1',
        exercises: { items: [] },
      },
    },
  ],
  meta: { total: 1, page: 1, limit: 20 },
};

beforeEach(() => jest.clearAllMocks());

describe('AthleteCalendarScreen (TLX-100 / A-08)', () => {
  it('rend le calendrier avec les séances affectées dérivées', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteCalendarScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('calendar-undated-as-1')).toBeOnTheScreen());
    expect(screen.getByText('Sprint 60m')).toBeOnTheScreen();
    expect(screen.getByTestId('calendar-week-label')).toBeOnTheScreen();
  });

  it('ouvre le détail de la séance au tap', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteCalendarScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('calendar-undated-as-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('calendar-undated-as-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ id: 'as-1' }) }),
    );
  });

  it('état vide quand aucune séance', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    });
    render(<AthleteCalendarScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('calendar-empty')).toBeOnTheScreen());
  });

  it('état erreur + réessai', async () => {
    mockListAssignments.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<AthleteCalendarScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('calendar-error')).toBeOnTheScreen());

    mockListAssignments.mockResolvedValueOnce({ status: 200, data: PAGE });
    fireEvent.press(screen.getByTestId('calendar-retry'));
    await waitFor(() => expect(screen.getByTestId('calendar-undated-as-1')).toBeOnTheScreen());
  });
});
