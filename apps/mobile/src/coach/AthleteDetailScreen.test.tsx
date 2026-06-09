import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetAthleteStats = jest.fn();
const mockListAssignments = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('@talent-x/api-client', () => ({
  getAthleteStats: (...args: unknown[]) => mockGetAthleteStats(...args),
  listAssignments: (...args: unknown[]) => mockListAssignments(...args),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
  useLocalSearchParams: () => mockParams,
}));

import { AthleteDetailScreen } from './AthleteDetailScreen';

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

const STATS = {
  athleteId: 'a-1',
  metrics: {
    assignmentsTotal: 4,
    completed: 2,
    missed: 1,
    completionRate: 0.5,
    avgRpe: 7,
    lastPerformanceAt: '2026-02-05T00:00:00.000Z',
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'a-1', name: 'Léa Dubois', status: 'late', sport: '200m' };
  mockListAssignments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
});

describe('AthleteDetailScreen (TLX-045)', () => {
  it('affiche identité (params) + métriques (stats)', async () => {
    mockGetAthleteStats.mockResolvedValue({ status: 200, data: STATS });
    render(<AthleteDetailScreen />, { wrapper: Wrapper });

    // Identité immédiate via params
    expect(screen.getByTestId('athlete-detail-name')).toHaveTextContent('Léa Dubois');
    expect(screen.getByTestId('status-badge-late')).toHaveTextContent('En retard');

    await waitFor(() => expect(screen.getByTestId('athlete-stat-done-value')).toBeOnTheScreen());
    expect(screen.getByTestId('athlete-stat-done-value')).toHaveTextContent('2/4');
    expect(screen.getByTestId('athlete-stat-rate-value')).toHaveTextContent('50 %');
    expect(screen.getByTestId('athlete-stat-missed-value')).toHaveTextContent('1');
    expect(screen.getByTestId('athlete-stat-rpe-value')).toHaveTextContent('7');
  });

  it('message dédié si consentement manquant (403 CONSENT_REQUIRED)', async () => {
    mockGetAthleteStats.mockResolvedValue({ status: 403, data: { error: 'CONSENT_REQUIRED' } });
    render(<AthleteDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('athlete-detail-consent')).toBeOnTheScreen());
    expect(screen.getByTestId('athlete-detail-consent')).toHaveTextContent(/consentement requis/);
  });

  it('état erreur générique + réessai', async () => {
    mockGetAthleteStats.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<AthleteDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('athlete-detail-error')).toBeOnTheScreen());
    mockGetAthleteStats.mockResolvedValueOnce({ status: 200, data: STATS });
    fireEvent.press(screen.getByTestId('athlete-detail-retry'));
    await waitFor(() => expect(screen.getByTestId('athlete-stat-done-value')).toBeOnTheScreen());
  });

  it('bouton retour appelle router.back', async () => {
    mockGetAthleteStats.mockResolvedValue({ status: 200, data: STATS });
    render(<AthleteDetailScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('athlete-detail-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('liste les séances réalisées de l’athlète et ouvre la revue (C-08)', async () => {
    mockGetAthleteStats.mockResolvedValue({ status: 200, data: STATS });
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 'asg-1',
            athleteId: 'a-1',
            status: 'completed',
            session: { title: 'Haut du corps' },
          },
          {
            id: 'asg-9',
            athleteId: 'autre',
            status: 'completed',
            session: { title: 'Autre athlète' },
          },
        ],
        meta: {},
      },
    });
    render(<AthleteDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('review-session-asg-1')).toBeOnTheScreen());
    // Filtré sur l'athlète courant : la séance d'un autre athlète n'apparaît pas.
    expect(screen.queryByTestId('review-session-asg-9')).toBeNull();

    fireEvent.press(screen.getByTestId('review-session-asg-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ id: 'asg-1', athlete: 'Léa Dubois' }),
      }),
    );
  });

  it('RPE absent affiché « — »', async () => {
    mockGetAthleteStats.mockResolvedValue({
      status: 200,
      data: {
        athleteId: 'a-1',
        metrics: { assignmentsTotal: 0, completed: 0, missed: 0, completionRate: 0 },
      },
    });
    render(<AthleteDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('athlete-stat-rpe-value')).toBeOnTheScreen());
    expect(screen.getByTestId('athlete-stat-rpe-value')).toHaveTextContent('—');
    expect(screen.getByTestId('athlete-stat-last')).toHaveTextContent('Aucune');
  });
});
