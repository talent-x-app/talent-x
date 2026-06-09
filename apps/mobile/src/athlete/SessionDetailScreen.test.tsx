import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetAssignment = jest.fn();
const mockGetPerformance = jest.fn();
const mockSubmitPerformance = jest.fn();
const mockUpdatePerformance = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getAssignment: (...a: unknown[]) => mockGetAssignment(...a),
  getPerformance: (...a: unknown[]) => mockGetPerformance(...a),
  submitPerformance: (...a: unknown[]) => mockSubmitPerformance(...a),
  updatePerformance: (...a: unknown[]) => mockUpdatePerformance(...a),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: 'as-1' }),
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { SessionDetailScreen } from './SessionDetailScreen';

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
  id: 'as-1',
  sessionId: 's-1',
  athleteId: 'me',
  status: 'assigned',
  session: {
    id: 's-1',
    title: 'Haut du corps',
    description: 'Séance de force',
    scheduledDate: '2026-06-12T00:00:00.000Z',
    status: 'published',
    coachId: 'c-1',
    exercises: {
      items: [
        { name: 'Développé couché', order: 0, sets: 4, reps: 8 },
        { name: 'Tractions', order: 1, sets: 3, reps: 10 },
      ],
    },
  },
};

beforeEach(() => jest.clearAllMocks());

describe('SessionDetailScreen (TLX-065/071 — A-03/A-04)', () => {
  it('affiche la séance et ses exercices', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('session-detail-title')).toHaveTextContent('Haut du corps'),
    );
    expect(screen.getByTestId('exercise-0')).toHaveTextContent(/Développé couché/);
    expect(screen.getByTestId('exercise-1')).toHaveTextContent(/Tractions/);
    expect(screen.getByTestId('submit-performance')).toHaveTextContent('Enregistrer ma perf');
  });

  it('soumet la perf avec en-tête Idempotency-Key et résultats par exercice', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    mockSubmitPerformance.mockResolvedValue({ status: 201, data: { id: 'p-1' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('exercise-0')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('exercise-0')); // coche le 1er exercice
    fireEvent.press(screen.getByTestId('submit-performance'));

    await waitFor(() => expect(mockSubmitPerformance).toHaveBeenCalled());
    const [assignmentId, body, options] = mockSubmitPerformance.mock.calls[0];
    expect(assignmentId).toBe('as-1');
    expect(options.headers['Idempotency-Key']).toBe('perf-as-1');
    expect(body.rpe).toBe(7);
    expect(body.results.items).toHaveLength(2);
    expect(body.results.items[0]).toMatchObject({
      exerciseName: 'Développé couché',
      setResults: [{ set: 1, completed: true }],
    });
    expect(body.results.items[1].setResults[0].completed).toBe(false);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('affiche un message dédié quand le consentement manque', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    mockSubmitPerformance.mockResolvedValue({ status: 403, data: { error: 'CONSENT_REQUIRED' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('submit-performance')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('submit-performance'));

    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'danger',
          description: expect.stringContaining('consentement'),
        }),
      ),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('préremplit et met à jour quand une perf existe déjà', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({
      status: 200,
      data: {
        id: 'p-1',
        assignmentId: 'as-1',
        athleteId: 'me',
        rpe: 9,
        notes: 'Dur',
        submittedAt: '2026-06-12T10:00:00.000Z',
        results: {
          items: [{ exerciseName: 'Développé couché', setResults: [{ set: 1, completed: true }] }],
        },
      },
    });
    mockUpdatePerformance.mockResolvedValue({ status: 200, data: { id: 'p-1' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('session-detail-saved')).toBeOnTheScreen());
    expect(screen.getByTestId('rpe-value')).toHaveTextContent('9/10');
    expect(screen.getByTestId('submit-performance')).toHaveTextContent('Mettre à jour');

    fireEvent.press(screen.getByTestId('submit-performance'));
    await waitFor(() => expect(mockUpdatePerformance).toHaveBeenCalled());
    expect(mockSubmitPerformance).not.toHaveBeenCalled();
  });

  it('état erreur si la séance ne charge pas', async () => {
    mockGetAssignment.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('session-detail-error')).toBeOnTheScreen());
  });
});
