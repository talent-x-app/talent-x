import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetMyProgress = jest.fn();
const mockListMyRecords = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getMyProgress: (...a: unknown[]) => mockGetMyProgress(...a),
  listMyRecords: (...a: unknown[]) => mockListMyRecords(...a),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));

import { ProgressScreen } from './ProgressScreen';

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

/** Date du jour (UTC) moins `days` jours, au format date du contrat. */
function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const PROGRESS = {
  athleteId: 'a-1',
  metrics: {
    assignmentsTotal: 4,
    completed: 3,
    missed: 1,
    completionRate: 0.75,
    avgRpe: 7.2,
  },
  series: [
    {
      eventKey: 'sprint:60m',
      label: '60 m',
      unit: 's',
      direction: 'min',
      points: [
        { date: daysAgo(20), value: 7.6 },
        { date: daysAgo(2), value: 7.45 },
      ],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListMyRecords.mockResolvedValue({ status: 200, data: { items: [] } });
});

describe('ProgressScreen (TLX-090 — A-06)', () => {
  it('affiche métriques, graphe par épreuve, dernière marque et tendance', async () => {
    mockGetMyProgress.mockResolvedValue({ status: 200, data: PROGRESS });
    render(<ProgressScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('progress-series-sprint:60m')).toBeOnTheScreen());
    expect(screen.getByText('3/4')).toBeOnTheScreen();
    expect(screen.getByText('75 %')).toBeOnTheScreen();
    expect(screen.getByText('7.2')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-last-sprint:60m')).toHaveTextContent('7.45 s');
    // Chrono en baisse → progression (sens min).
    expect(screen.getByTestId('progress-trend-sprint:60m-up')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-bar-sprint:60m-0')).toBeOnTheScreen();
    expect(screen.getByTestId('progress-bar-sprint:60m-1')).toBeOnTheScreen();
  });

  it('la fenêtre Semaine exclut les marques plus anciennes', async () => {
    mockGetMyProgress.mockResolvedValue({ status: 200, data: PROGRESS });
    render(<ProgressScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('progress-series-sprint:60m')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('progress-window-week'));
    // Une seule marque (J-2) reste : plus de barre n° 1, plus de tendance.
    expect(screen.getByTestId('progress-bar-sprint:60m-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('progress-bar-sprint:60m-1')).toBeNull();
    expect(screen.queryByTestId('progress-trend-sprint:60m-up')).toBeNull();
  });

  it('état vide quand aucune série, records (A-07) toujours rendus', async () => {
    mockGetMyProgress.mockResolvedValue({
      status: 200,
      data: { ...PROGRESS, series: [] },
    });
    render(<ProgressScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('progress-empty')).toBeOnTheScreen());
    await waitFor(() => expect(screen.getByTestId('records-empty')).toBeOnTheScreen());
  });

  it('message dédié quand le consentement manque', async () => {
    mockGetMyProgress.mockResolvedValue({ status: 403, data: { error: 'CONSENT_REQUIRED' } });
    render(<ProgressScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('progress-consent')).toBeOnTheScreen());
  });
});
