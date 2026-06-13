import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListMyRecords = jest.fn();
const mockGetMyProgress = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listMyRecords: (...a: unknown[]) => mockListMyRecords(...a),
  getMyProgress: (...a: unknown[]) => mockGetMyProgress(...a),
  createManualRecord: jest.fn(),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }) }));

import { PersonalRecordsSection } from './PersonalRecordsSection';

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

const RECORDS = [
  {
    id: 'r-1',
    athleteId: 'a-1',
    eventKey: 'sprint:60m',
    label: '60 m',
    value: 7.3,
    unit: 's',
    direction: 'min',
    achievedAt: '2026-06-10',
    performanceId: 'perf-1',
    updatedAt: '2026-06-10T10:00:00.000Z',
  },
  {
    id: 'r-2',
    athleteId: 'a-1',
    eventKey: 'jumps',
    label: 'Saut',
    value: 6.42,
    unit: 'm',
    direction: 'max',
    achievedAt: '2026-05-01',
    updatedAt: '2026-05-01T10:00:00.000Z',
  },
];

const PROGRESS = {
  athleteId: 'a-1',
  metrics: { assignmentsTotal: 1, completed: 1, missed: 0, skipped: 0, completionRate: 1 },
  series: [
    {
      eventKey: 'sprint:60m',
      label: '60 m',
      unit: 's',
      direction: 'min',
      points: [{ date: '2026-05-20', value: 7.34 }],
      seasonBest: { date: '2026-05-20', value: 7.34 },
      marksByYear: [{ year: 2026, best: 7.34, count: 1 }],
    },
    // « jumps » : pas de seasonBest → aucune ligne SB attendue.
    { eventKey: 'jumps', label: 'Saut', unit: 'm', direction: 'max', points: [], marksByYear: [] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyProgress.mockResolvedValue({ status: 200, data: PROGRESS });
});

describe('PersonalRecordsSection (TLX-091 — A-07)', () => {
  it('liste les records : marque formatée, date, badge manuel sans performance source', async () => {
    mockListMyRecords.mockResolvedValue({ status: 200, data: { items: RECORDS } });
    render(<PersonalRecordsSection />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('record-sprint:60m')).toBeOnTheScreen());
    expect(screen.getByTestId('record-sprint:60m-value')).toHaveTextContent('7.3 s');
    expect(screen.getByTestId('record-jumps-value')).toHaveTextContent('6.42 m');
    // r-2 n'a pas de performanceId → record déclaré manuellement.
    expect(within(screen.getByTestId('record-jumps')).getByText(/manuel/)).toBeOnTheScreen();
    expect(within(screen.getByTestId('record-sprint:60m')).queryByText(/manuel/)).toBeNull();
  });

  it('affiche la ligne SB <année> sous le PB quand la progression la fournit (ADR-34)', async () => {
    mockListMyRecords.mockResolvedValue({ status: 200, data: { items: RECORDS } });
    render(<PersonalRecordsSection />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('record-sprint:60m-sb')).toHaveTextContent('SB 2026 · 7.34 s'),
    );
    // « jumps » sans seasonBest → aucune ligne SB.
    expect(screen.queryByTestId('record-jumps-sb')).toBeNull();
  });

  it('état vide avec invitation à saisir ses perfs', async () => {
    mockListMyRecords.mockResolvedValue({ status: 200, data: { items: [] } });
    render(<PersonalRecordsSection />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('records-empty')).toBeOnTheScreen());
  });

  it('état erreur avec réessai', async () => {
    mockListMyRecords.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    mockListMyRecords.mockResolvedValueOnce({ status: 200, data: { items: RECORDS } });
    render(<PersonalRecordsSection />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('records-error')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('records-retry'));
    await waitFor(() => expect(screen.getByTestId('record-sprint:60m')).toBeOnTheScreen());
  });
});
