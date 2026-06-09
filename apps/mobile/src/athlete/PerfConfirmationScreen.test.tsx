import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetAssignment = jest.fn();
const mockGetPerformance = jest.fn();
const mockConfirmRecord = jest.fn();
const mockReplace = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getAssignment: (...a: unknown[]) => mockGetAssignment(...a),
  getPerformance: (...a: unknown[]) => mockGetPerformance(...a),
  confirmRecord: (...a: unknown[]) => mockConfirmRecord(...a),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'asg-1' }),
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { PerfConfirmationScreen } from './PerfConfirmationScreen';

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

const ASSIGNMENT = {
  id: 'asg-1',
  status: 'completed',
  session: { id: 's-1', title: 'VMA + Longueur', exercises: { items: [] } },
};

const PERF = {
  id: 'perf-1',
  assignmentId: 'asg-1',
  athleteId: 'a-1',
  rpe: 7,
  notes: 'Bonnes jambes.',
  results: {
    schemaVersion: 2,
    items: [
      {
        exerciseName: 'VMA 6x400 m',
        order: 0,
        setResults: [
          { set: 1, timeSeconds: 72.4, completed: true },
          { set: 2, timeSeconds: 73.1, completed: true },
        ],
      },
      {
        exerciseName: 'Saut en longueur',
        order: 1,
        setResults: [
          { set: 1, distanceMeters: 6.05, completed: true },
          { set: 2, failed: true, completed: true },
        ],
      },
    ],
  },
  submittedAt: '2026-06-10T10:00:00.000Z',
};

beforeEach(() => jest.clearAllMocks());

describe('PerfConfirmationScreen (TLX-078 — A-05)', () => {
  it('confirme l’envoi et récapitule mesures v2, RPE et ressenti', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 200, data: PERF });
    render(<PerfConfirmationScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('perf-confirmation-title')).toBeOnTheScreen());
    expect(screen.getByTestId('perf-confirmation-title')).toHaveTextContent(
      'Performance envoyée !',
    );
    expect(screen.getByText(/VMA \+ Longueur/)).toBeOnTheScreen();
    expect(screen.getByText('7/10')).toBeOnTheScreen();
    expect(screen.getByText('2/2')).toBeOnTheScreen();
    expect(screen.getByTestId('perf-confirmation-measures-0')).toHaveTextContent(
      'VMA 6x400 m — 1:12.4 · 1:13.1',
    );
    expect(screen.getByTestId('perf-confirmation-measures-1')).toHaveTextContent(
      'Saut en longueur — 6.05 m · mordu',
    );
    expect(screen.getByTestId('perf-confirmation-notes')).toHaveTextContent('Bonnes jambes.');
  });

  it('navigue vers la liste des séances et le détail de la séance', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 200, data: PERF });
    render(<PerfConfirmationScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('perf-confirmation-title')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('perf-confirmation-back-sessions'));
    expect(mockReplace).toHaveBeenCalledWith('/(athlete)/sessions');
    fireEvent.press(screen.getByTestId('perf-confirmation-view-session'));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/(athlete)/session/[id]',
      params: { id: 'asg-1' },
    });
  });

  it('propose les candidats record et les valide un à un (TLX-076, ADR-20)', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({
      status: 200,
      data: {
        ...PERF,
        recordCandidates: [
          { eventKey: 'interval:400m', label: '400 m', value: 72.4, unit: 's', previousValue: 73 },
          { eventKey: 'jumps', label: 'Saut', value: 6.12, unit: 'm' },
        ],
      },
    });
    mockConfirmRecord.mockResolvedValue({
      status: 200,
      data: { id: 'rec-1', eventKey: 'interval:400m', value: 72.4, unit: 's' },
    });
    render(<PerfConfirmationScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('record-candidates')).toBeOnTheScreen());
    expect(screen.getByTestId('record-candidate-interval:400m')).toHaveTextContent(
      '400 m — 1:12.4',
    );
    expect(screen.getByText('Ancien record : 1:13')).toBeOnTheScreen();
    expect(screen.getByTestId('record-candidate-jumps')).toHaveTextContent('Saut — 6.12 m');
    expect(screen.getByText('Première marque sur cette épreuve')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('record-confirm-interval:400m'));
    await waitFor(() =>
      expect(screen.getByTestId('record-confirmed-interval:400m')).toBeOnTheScreen(),
    );
    expect(mockConfirmRecord).toHaveBeenCalledWith('interval:400m', { performanceId: 'perf-1' });
    // L'autre candidat reste proposé.
    expect(screen.getByTestId('record-confirm-jumps')).toBeOnTheScreen();
  });

  it('sans candidat record, la carte n’apparaît pas', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 200, data: PERF });
    render(<PerfConfirmationScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('perf-confirmation-title')).toBeOnTheScreen());
    expect(screen.queryByTestId('record-candidates')).toBeNull();
  });

  it('affiche l’état d’erreur si la performance est introuvable', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<PerfConfirmationScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('perf-confirmation-error')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('perf-confirmation-back-sessions'));
    expect(mockReplace).toHaveBeenCalledWith('/(athlete)/sessions');
  });
});
