import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListMyRecords = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listMyRecords: (...a: unknown[]) => mockListMyRecords(...a),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));

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

beforeEach(() => jest.clearAllMocks());

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
