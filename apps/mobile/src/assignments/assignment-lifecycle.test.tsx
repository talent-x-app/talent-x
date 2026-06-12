import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  updateAssignment: (...a: unknown[]) => mockUpdate(...a),
  deleteAssignment: (...a: unknown[]) => mockDelete(...a),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
  AssignmentUpdateRequestStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    skipped: 'skipped',
  },
  SkipReason: { injury: 'injury', absence: 'absence', weather: 'weather', other: 'other' },
}));

jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { CoachAssignmentActions, SkipSessionCard } from './assignment-lifecycle';

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

const assignment = (over: Record<string, unknown> = {}) => ({
  id: 'asg-1',
  sessionId: 's-1',
  athleteId: 'a-1',
  status: 'assigned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('SkipSessionCard (ADR-31 — athlète)', () => {
  it('séance réalisée : ne propose pas de skip', () => {
    render(<SkipSessionCard assignment={assignment({ status: 'completed' }) as never} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByTestId('skip-open')).toBeNull();
    expect(screen.queryByTestId('skip-card-signaled')).toBeNull();
  });

  it('signale une indispo : motif requis puis PATCH status=skipped', async () => {
    mockUpdate.mockResolvedValue({
      status: 200,
      data: assignment({ status: 'skipped', skipReason: 'injury' }),
    });
    render(<SkipSessionCard assignment={assignment() as never} />, { wrapper: Wrapper });

    fireEvent.press(screen.getByTestId('skip-open'));
    // Sans motif choisi, la confirmation est désactivée → aucun appel.
    fireEvent.press(screen.getByTestId('skip-confirm'));
    expect(mockUpdate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('skip-reason-injury'));
    fireEvent.press(screen.getByTestId('skip-confirm'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('asg-1', { status: 'skipped', skipReason: 'injury' }),
    );
  });

  it('indispo déjà signalée : affiche le motif et permet de revenir en arrière', async () => {
    mockUpdate.mockResolvedValue({ status: 200, data: assignment({ status: 'assigned' }) });
    render(
      <SkipSessionCard
        assignment={assignment({ status: 'skipped', skipReason: 'weather' }) as never}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByText(/Indisponibilité signalée · Météo/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('skip-undo'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('asg-1', { status: 'assigned' }));
  });
});

describe('CoachAssignmentActions (ADR-31 — coach)', () => {
  it('replanifie : saisit une date puis PATCH dueDate, et notifie le parent', async () => {
    mockUpdate.mockResolvedValue({ status: 200, data: assignment({ dueDate: '2026-09-01' }) });
    const onChanged = jest.fn();
    render(<CoachAssignmentActions assignment={assignment() as never} onChanged={onChanged} />, {
      wrapper: Wrapper,
    });

    fireEvent.press(screen.getByTestId('coach-replan-open'));
    fireEvent.changeText(screen.getByTestId('replan-date'), '2026-09-01');
    fireEvent.press(screen.getByTestId('replan-confirm'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('asg-1', { dueDate: '2026-09-01' }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('désassigne après confirmation : DELETE puis notifie le parent', async () => {
    mockDelete.mockResolvedValue({ status: 204 });
    const onChanged = jest.fn();
    render(<CoachAssignmentActions assignment={assignment() as never} onChanged={onChanged} />, {
      wrapper: Wrapper,
    });

    fireEvent.press(screen.getByTestId('coach-unassign-open'));
    fireEvent.press(screen.getByTestId('unassign-confirm'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('asg-1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('désassignation d’une séance réalisée : message dédié (422 ASSIGNMENT_COMPLETED)', async () => {
    mockDelete.mockResolvedValue({ status: 422, data: { error: 'ASSIGNMENT_COMPLETED' } });
    render(<CoachAssignmentActions assignment={assignment({ status: 'completed' }) as never} />, {
      wrapper: Wrapper,
    });
    fireEvent.press(screen.getByTestId('coach-unassign-open'));
    fireEvent.press(screen.getByTestId('unassign-confirm'));
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Désassignation impossible' }),
      ),
    );
  });
});
