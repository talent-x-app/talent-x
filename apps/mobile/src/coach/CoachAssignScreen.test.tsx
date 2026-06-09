import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetCoachDashboard = jest.fn();
const mockAssignSession = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getCoachDashboard: (...a: unknown[]) => mockGetCoachDashboard(...a),
  assignSession: (...a: unknown[]) => mockAssignSession(...a),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { CoachAssignScreen } from './CoachAssignScreen';

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
  summary: {
    athleteCount: 2,
    toReview: 0,
    today: 0,
    alerts: { missedSessions: 0, consentMissing: 0 },
  },
  athletes: [
    {
      id: 'a-1',
      firstName: 'Nina',
      lastName: 'Koné',
      status: 'up_to_date',
      overdueCount: 0,
      toReviewCount: 0,
    },
    {
      id: 'a-2',
      firstName: 'Tom',
      lastName: 'Bah',
      status: 'late',
      overdueCount: 1,
      toReviewCount: 0,
    },
  ],
};

beforeEach(() => jest.clearAllMocks());

describe('CoachAssignScreen (TLX-063 — C-06/C-07)', () => {
  it('liste les athlètes liés et le titre de la séance', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    expect(screen.getByTestId('assign-session-title')).toHaveTextContent('Vitesse');
    expect(screen.getByTestId('assign-athlete-a-1')).toHaveTextContent(/Nina Koné/);
    expect(screen.getByTestId('assign-athlete-a-2')).toHaveTextContent(/Tom Bah/);
  });

  it('bouton désactivé tant qu’aucun athlète n’est sélectionné', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-submit')).toBeOnTheScreen());
    expect(screen.getByTestId('assign-submit')).toHaveTextContent(/sélectionne/i);
    expect(screen.getByTestId('assign-submit')).toBeDisabled();
  });

  it('sélectionne, assigne (Idempotency-Key + dueDate) puis affiche la confirmation', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockAssignSession.mockResolvedValue({ status: 201, data: { items: [] } });
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    fireEvent.press(screen.getByTestId('assign-athlete-a-2'));
    fireEvent.changeText(screen.getByTestId('assign-due-date'), '2026-06-20');
    expect(screen.getByTestId('assign-submit')).toHaveTextContent('Assigner à 2 athlètes');
    fireEvent.press(screen.getByTestId('assign-submit'));

    await waitFor(() => expect(mockAssignSession).toHaveBeenCalled());
    const [sessionId, body, options] = mockAssignSession.mock.calls[0];
    expect(sessionId).toBe('s-1');
    expect(body.athleteIds).toEqual(['a-1', 'a-2']);
    expect(body.dueDate).toBe('2026-06-20');
    expect(options.headers['Idempotency-Key']).toBe('assign-s-1-a-1-a-2');

    // Confirmation (C-07) : récapitulatif des athlètes affectés.
    await waitFor(() => expect(screen.getByTestId('assign-confirmation')).toBeOnTheScreen());
    expect(screen.getByTestId('assign-confirmation-summary')).toHaveTextContent(/2 athlètes/);
    expect(screen.getByTestId('assign-confirmation')).toHaveTextContent(/Nina Koné/);
    expect(screen.getByTestId('assign-confirmation')).toHaveTextContent(/Tom Bah/);

    fireEvent.press(screen.getByTestId('assign-done'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('omet dueDate si vide', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockAssignSession.mockResolvedValue({ status: 201, data: { items: [] } });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    fireEvent.press(screen.getByTestId('assign-submit'));

    await waitFor(() => expect(mockAssignSession).toHaveBeenCalled());
    expect(mockAssignSession.mock.calls[0][1].dueDate).toBeUndefined();
  });

  it('toast d’erreur si l’assignation échoue', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockAssignSession.mockResolvedValue({ status: 409, data: { error: 'CONFLICT' } });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    fireEvent.press(screen.getByTestId('assign-submit'));

    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })),
    );
    expect(screen.queryByTestId('assign-confirmation')).toBeNull();
  });

  it('état vide quand aucun athlète n’est lié', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: { ...DASHBOARD, athletes: [], summary: { ...DASHBOARD.summary, athleteCount: 0 } },
    });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-empty')).toBeOnTheScreen());
    expect(screen.queryByTestId('assign-submit')).toBeNull();
  });

  it('état erreur si le chargement des athlètes échoue', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-error')).toBeOnTheScreen());
  });
});
