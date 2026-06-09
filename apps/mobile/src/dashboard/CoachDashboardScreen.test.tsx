import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetCoachDashboard = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getCoachDashboard: (...args: unknown[]) => mockGetCoachDashboard(...args),
  // Enum orval réexporté tel quel (valeurs littérales).
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));

import { CoachDashboardScreen } from './CoachDashboardScreen';

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
      sport: undefined,
      status: 'pending_review',
      overdueCount: 0,
      toReviewCount: 1,
      coachAccessGranted: true,
    },
  ],
  summary: {
    athleteCount: 2,
    toReview: 1,
    today: 0,
    alerts: { missedSessions: 1, consentMissing: 1 },
  },
};

beforeEach(() => jest.clearAllMocks());

describe('CoachDashboardScreen (TLX-081)', () => {
  it('affiche le spinner pendant le chargement', () => {
    mockGetCoachDashboard.mockReturnValue(new Promise(() => {}));
    render(<CoachDashboardScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('coach-dashboard-loading')).toBeOnTheScreen();
  });

  it('charge puis affiche KPIs, athlètes et leurs statuts', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-kpi-toreview')).toBeOnTheScreen(),
    );
    // KPI « À revoir » = 1, « Aujourd'hui » = 0 (valeur ciblée par testID dédié)
    expect(screen.getByTestId('coach-dashboard-kpi-toreview-value')).toHaveTextContent('1');
    expect(screen.getByTestId('coach-dashboard-kpi-today-value')).toHaveTextContent('0');
    // Sous-titre : nombre d'athlètes
    expect(screen.getByTestId('coach-dashboard-subtitle')).toHaveTextContent('2 athlètes suivis');
    // Athlètes + statuts
    expect(screen.getByText('Léa Dubois')).toBeOnTheScreen();
    expect(screen.getByText('Tom Petit')).toBeOnTheScreen();
    expect(screen.getByTestId('status-badge-late')).toHaveTextContent('En retard');
    expect(screen.getByTestId('status-badge-pending_review')).toHaveTextContent('À revoir');
  });

  it('affiche le bandeau d’alertes quand retards ou consentements manquants', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-dashboard-alerts')).toBeOnTheScreen());
    // Bandeau concaténé → match partiel via regex.
    expect(screen.getByTestId('coach-dashboard-alerts')).toHaveTextContent(/1 séance en retard/);
    expect(screen.getByTestId('coach-dashboard-alerts')).toHaveTextContent(
      /1 consentement d'accès manquant/,
    );
  });

  it('masque le bandeau d’alertes quand aucun signal', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: {
        athletes: [{ ...DASHBOARD.athletes[1], status: 'up_to_date' }],
        summary: {
          athleteCount: 1,
          toReview: 0,
          today: 0,
          alerts: { missedSessions: 0, consentMissing: 0 },
        },
      },
    });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Tom Petit')).toBeOnTheScreen());
    expect(screen.queryByTestId('coach-dashboard-alerts')).toBeNull();
    expect(screen.getByTestId('status-badge-up_to_date')).toHaveTextContent('À jour');
  });

  it('état vide quand aucun athlète lié', async () => {
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
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-dashboard-empty')).toBeOnTheScreen());
    expect(screen.getByTestId('coach-dashboard-subtitle')).toHaveTextContent('0 athlète suivi');
  });

  it('état erreur : message + réessai relance la requête', async () => {
    mockGetCoachDashboard.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-dashboard-error')).toBeOnTheScreen());

    mockGetCoachDashboard.mockResolvedValueOnce({ status: 200, data: DASHBOARD });
    fireEvent.press(screen.getByTestId('coach-dashboard-retry'));
    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-kpi-toreview')).toBeOnTheScreen(),
    );
  });
});
