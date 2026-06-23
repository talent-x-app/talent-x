import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Assignment } from '@talent-x/api-client';

const mockSetAttendance = jest.fn();
const mockGetAttendanceSummary = jest.fn();
const mockGetTeammatesAttendance = jest.fn();
const mockGiveKudos = jest.fn();
const mockRemoveKudos = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return {
    ...actual,
    setAttendance: (...a: unknown[]) => mockSetAttendance(...a),
    getAttendanceSummary: (...a: unknown[]) => mockGetAttendanceSummary(...a),
    getTeammatesAttendance: (...a: unknown[]) => mockGetTeammatesAttendance(...a),
    giveKudos: (...a: unknown[]) => mockGiveKudos(...a),
    removeKudos: (...a: unknown[]) => mockRemoveKudos(...a),
  };
});
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow }),
  toUserMessage: () => ({ title: 'Échec', description: 'réessaie' }),
}));

import { AttendanceSummaryView, PresenceControl, TeammatesKudosView } from './presence-ui';
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
  mockGetAttendanceSummary.mockReset();
  mockGetTeammatesAttendance.mockReset();
  mockGiveKudos.mockReset();
  mockRemoveKudos.mockReset();
  mockShow.mockReset();
});

function renderKudos(assignmentId = 'asg-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
      <TeammatesKudosView assignmentId={assignmentId} />
    </Wrapper>,
  );
  return client;
}

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

function renderSummary(assignmentId = 'asg-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
      <AttendanceSummaryView assignmentId={assignmentId} />
    </Wrapper>,
  );
}

describe('AttendanceSummaryView (ADR-45 — agrégat sans noms)', () => {
  it('affiche les compteurs agrégés quand total > 1', async () => {
    mockGetAttendanceSummary.mockResolvedValue({
      status: 200,
      data: { going: 6, notGoing: 1, maybe: 2, noResponse: 3, total: 12 },
    });
    renderSummary();
    await waitFor(() => expect(screen.getByTestId('attendance-summary')).toBeOnTheScreen());
    expect(screen.getByText(/6 présents/)).toBeOnTheScreen();
    expect(screen.getByText(/1 absent/)).toBeOnTheScreen();
    expect(screen.getByText(/3 sans réponse/)).toBeOnTheScreen();
  });

  it('ne rend rien quand l’agrégat n’a pas de sens (total ≤ 1)', async () => {
    mockGetAttendanceSummary.mockResolvedValue({
      status: 200,
      data: { going: 0, notGoing: 0, maybe: 1, noResponse: 0, total: 1 },
    });
    renderSummary();
    await waitFor(() => expect(mockGetAttendanceSummary).toHaveBeenCalled());
    expect(screen.queryByTestId('attendance-summary')).toBeNull();
  });
});

describe('TeammatesKudosView (ADR-48/49, Palier 2)', () => {
  const teammate = (over = {}) => ({
    assignmentId: 'asg-2',
    teammate: { id: 'a-2', firstName: 'Léa', lastName: 'Bernard' },
    kudos: { count: 0, givers: [], mine: false },
    ...over,
  });

  it('silencieux si aucun coéquipier confirmé', async () => {
    mockGetTeammatesAttendance.mockResolvedValue({ status: 200, data: { data: [] } });
    renderKudos();
    await waitFor(() => expect(mockGetTeammatesAttendance).toHaveBeenCalledWith('asg-1'));
    expect(screen.queryByTestId('teammates-attendance')).toBeNull();
  });

  it('liste les coéquipiers présents + pose un kudos (giveKudos sur leur affectation)', async () => {
    mockGetTeammatesAttendance.mockResolvedValue({ status: 200, data: { data: [teammate()] } });
    mockGiveKudos.mockResolvedValue({
      status: 200,
      data: { count: 1, givers: [{ id: 'a-1', firstName: 'At' }], mine: true },
    });
    renderKudos();
    await waitFor(() => expect(screen.getByTestId('teammate-going-asg-2')).toBeOnTheScreen());
    expect(screen.getByText('Léa Bernard')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('kudos-asg-2'));
    await waitFor(() => expect(mockGiveKudos).toHaveBeenCalledWith('asg-2'));
    expect(mockRemoveKudos).not.toHaveBeenCalled();
  });

  it('retire un kudos déjà posé (toggle → removeKudos)', async () => {
    mockGetTeammatesAttendance.mockResolvedValue({
      status: 200,
      data: { data: [teammate({ kudos: { count: 1, givers: [], mine: true } })] },
    });
    mockRemoveKudos.mockResolvedValue({ status: 200, data: { count: 0, givers: [], mine: false } });
    renderKudos();
    await waitFor(() => expect(screen.getByTestId('kudos-count-asg-2')).toHaveTextContent('1'));

    fireEvent.press(screen.getByTestId('kudos-asg-2'));
    await waitFor(() => expect(mockRemoveKudos).toHaveBeenCalledWith('asg-2'));
    expect(mockGiveKudos).not.toHaveBeenCalled();
  });
});
