import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetCoachDashboard = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getCoachDashboard: (...args: unknown[]) => mockGetCoachDashboard(...args),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { CoachAthletesScreen } from './CoachAthletesScreen';

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

const DASHBOARD = {
  athletes: [
    {
      id: 'a-1',
      firstName: 'Léa',
      lastName: 'Dubois',
      sport: '200m',
      status: 'late',
      overdueCount: 1,
      toReviewCount: 0,
      coachAccessGranted: false,
    },
    {
      id: 'a-2',
      firstName: 'Tom',
      lastName: 'Petit',
      status: 'up_to_date',
      overdueCount: 0,
      toReviewCount: 0,
      coachAccessGranted: true,
    },
  ],
  summary: {
    athleteCount: 2,
    toReview: 0,
    today: 0,
    alerts: { missedSessions: 1, consentMissing: 1 },
  },
};

beforeEach(() => jest.clearAllMocks());

describe('CoachAthletesScreen (TLX-044)', () => {
  it('liste les athlètes liés avec leur statut', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAthletesScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Léa Dubois')).toBeOnTheScreen());
    expect(screen.getByText('Tom Petit')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-athletes-count')).toHaveTextContent('2 athlètes liés');
    expect(screen.getByTestId('status-badge-late')).toHaveTextContent('En retard');
    expect(screen.getByTestId('status-badge-up_to_date')).toHaveTextContent('À jour');
  });

  it('ouvre le détail au tap sur un athlète', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAthletesScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-athletes-item-a-2')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('coach-athletes-item-a-2'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ id: 'a-2' }) }),
    );
  });

  it('état vide quand aucun athlète', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: {
        athletes: [],
        summary: {
          athleteCount: 0,
          toReview: 0,
          today: 0,
          alerts: { missedSessions: 0, consentMissing: 0 },
        },
      },
    });
    render(<CoachAthletesScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-athletes-empty')).toBeOnTheScreen());
  });

  it('état erreur + réessai', async () => {
    mockGetCoachDashboard.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachAthletesScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-athletes-error')).toBeOnTheScreen());

    mockGetCoachDashboard.mockResolvedValueOnce({ status: 200, data: DASHBOARD });
    fireEvent.press(screen.getByTestId('coach-athletes-retry'));
    await waitFor(() => expect(screen.getByText('Léa Dubois')).toBeOnTheScreen());
  });

  it('recherche : filtre par nom (accents ignorés) + état sans correspondance (TLX-117)', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAthletesScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-athletes-item-a-1')).toBeOnTheScreen());

    // « lea » (sans accent) ne garde que Léa Dubois.
    fireEvent.changeText(screen.getByTestId('coach-athletes-search'), 'lea');
    expect(screen.getByTestId('coach-athletes-item-a-1')).toBeOnTheScreen();
    expect(screen.queryByTestId('coach-athletes-item-a-2')).toBeNull();

    // Aucune correspondance → carte dédiée.
    fireEvent.changeText(screen.getByTestId('coach-athletes-search'), 'zzz');
    expect(screen.getByTestId('coach-athletes-no-match')).toBeOnTheScreen();
  });
});
