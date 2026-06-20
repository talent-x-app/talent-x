import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Assignment } from '@talent-x/api-client';

const mockSetAttendance = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return { ...actual, setAttendance: (...a: unknown[]) => mockSetAttendance(...a) };
});
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow }),
  toUserMessage: () => ({ title: 'Échec', description: 'réessaie' }),
}));

import { PresenceControl } from './presence-ui';
import { assignmentQueryKey } from './groups-query';

const NOW = new Date(2026, 5, 20);

function asg(over: Partial<Assignment> = {}): Assignment {
  return {
    id: 'asg-1',
    sessionId: 's-1',
    athleteId: 'a',
    status: 'assigned',
    dueDate: '2026-06-25',
    ...over,
  } as Assignment;
}

function setup(assignment: Assignment) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Seed le cache détail pour observer la mise à jour optimiste.
  client.setQueryData(assignmentQueryKey(assignment.id), assignment);
  function Wrapper({ children }: { children: ReactNode }) {
    const [c] = useState(() => client);
    return (
      <QueryClientProvider client={c}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    );
  }
  render(
    <Wrapper>
      <PresenceControl assignment={assignment} now={NOW} />
    </Wrapper>,
  );
  return client;
}

beforeEach(() => {
  mockSetAttendance.mockReset();
  mockShow.mockReset();
});

describe('PresenceControl (ADR-43 §1, Phase B)', () => {
  it('déclare « présent » → optimiste + toast succès', async () => {
    mockSetAttendance.mockResolvedValue({ status: 200, data: asg({ attendance: 'going' }) });
    const client = setup(asg());
    fireEvent.press(screen.getByTestId('presence-going'));
    // Optimiste : le cache détail reflète la présence (appliqué dans onMutate).
    await waitFor(() =>
      expect(client.getQueryData<Assignment>(assignmentQueryKey('asg-1'))?.attendance).toBe(
        'going',
      ),
    );
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    );
    expect(mockSetAttendance).toHaveBeenCalledWith('asg-1', {
      attendance: 'going',
      reason: undefined,
    });
  });

  it('« absent » ouvre le sélecteur de motif puis envoie not_going + motif', async () => {
    mockSetAttendance.mockResolvedValue({
      status: 200,
      data: asg({ attendance: 'not_going', attendanceReason: 'injury' }),
    });
    setup(asg());
    expect(screen.queryByTestId('presence-reasons')).toBeNull();
    fireEvent.press(screen.getByTestId('presence-not_going'));
    expect(screen.getByTestId('presence-reasons')).toBeOnTheScreen();
    expect(mockSetAttendance).not.toHaveBeenCalled(); // pas d'envoi avant le motif
    fireEvent.press(screen.getByTestId('presence-reason-injury'));
    await waitFor(() =>
      expect(mockSetAttendance).toHaveBeenCalledWith('asg-1', {
        attendance: 'not_going',
        reason: 'injury',
      }),
    );
  });

  it('échec serveur → rollback du cache + toast danger', async () => {
    mockSetAttendance.mockResolvedValue({ status: 500 });
    const client = setup(asg());
    fireEvent.press(screen.getByTestId('presence-maybe'));
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })),
    );
    // Rollback : le cache revient à l'état initial (sans réponse) après l'échec.
    expect(
      client.getQueryData<Assignment>(assignmentQueryKey('asg-1'))?.attendance,
    ).toBeUndefined();
  });

  it('affiche l’échéance dérivée tant que sans réponse', () => {
    setup(asg({ dueDate: '2026-06-25' }));
    expect(screen.getByTestId('presence-deadline')).toBeOnTheScreen();
  });

  it('masque l’échéance une fois la présence déclarée', () => {
    setup(asg({ attendance: 'going', dueDate: '2026-06-25' }));
    expect(screen.queryByTestId('presence-deadline')).toBeNull();
  });
});
