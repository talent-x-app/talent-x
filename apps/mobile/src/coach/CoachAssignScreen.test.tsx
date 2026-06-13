import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetCoachDashboard = jest.fn();
const mockAssignSession = jest.fn();
const mockListGroups = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getCoachDashboard: (...a: unknown[]) => mockGetCoachDashboard(...a),
  assignSession: (...a: unknown[]) => mockAssignSession(...a),
  listGroups: (...a: unknown[]) => mockListGroups(...a),
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

const GROUPS = {
  data: [
    { id: 'g-1', name: 'Sprint élite', memberCount: 5 },
    { id: 'g-2', name: 'Demi-fond', memberCount: 3 },
  ],
  meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
};

const NO_GROUPS = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };

beforeEach(() => {
  jest.clearAllMocks();
  // Par défaut : aucun groupe (les tests groupe surchargent ce mock).
  mockListGroups.mockResolvedValue({ status: 200, data: NO_GROUPS });
});

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
    mockAssignSession.mockResolvedValue({
      status: 201,
      data: {
        data: [
          { id: 'asg-a', athleteId: 'a-1', sessionId: 's-1' },
          { id: 'asg-b', athleteId: 'a-2', sessionId: 's-1' },
        ],
      },
    });
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    fireEvent.press(screen.getByTestId('assign-athlete-a-2'));
    fireEvent.changeText(screen.getByTestId('assign-due-date'), '2026-06-20');
    expect(screen.getByTestId('assign-submit')).toHaveTextContent('Assigner (2 cibles)');
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
    mockAssignSession.mockResolvedValue({
      status: 201,
      data: { data: [{ id: 'asg-a', athleteId: 'a-1', sessionId: 's-1' }] },
    });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    fireEvent.press(screen.getByTestId('assign-submit'));

    await waitFor(() => expect(mockAssignSession).toHaveBeenCalled());
    expect(mockAssignSession.mock.calls[0][1].dueDate).toBeUndefined();
  });

  it('assigne à un groupe entier (ADR-30) : groupIds envoyé, confirmation par effectif serveur', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockListGroups.mockResolvedValue({ status: 200, data: GROUPS });
    // Le serveur résout le groupe → 5 affectations matérialisées (athlètes distincts).
    mockAssignSession.mockResolvedValue({
      status: 201,
      data: {
        data: Array.from({ length: 5 }, (_, i) => ({
          id: `asg-${i}`,
          athleteId: `member-${i}`,
          sessionId: 's-1',
        })),
      },
    });
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-group-g-1')).toBeOnTheScreen());
    expect(screen.getByTestId('assign-group-g-1')).toHaveTextContent(/Sprint élite/);
    expect(screen.getByTestId('assign-group-g-1')).toHaveTextContent(/5 membres/);

    fireEvent.press(screen.getByTestId('assign-group-g-1'));
    expect(screen.getByTestId('assign-submit')).toHaveTextContent('Assigner (1 cible)');
    fireEvent.press(screen.getByTestId('assign-submit'));

    await waitFor(() => expect(mockAssignSession).toHaveBeenCalled());
    const body = mockAssignSession.mock.calls[0][1];
    expect(body.groupIds).toEqual(['g-1']);
    expect(body.athleteIds).toBeUndefined();

    await waitFor(() => expect(screen.getByTestId('assign-confirmation')).toBeOnTheScreen());
    // Récap : 5 athlètes (résolus côté serveur) + libellé du groupe ciblé.
    expect(screen.getByTestId('assign-confirmation-summary')).toHaveTextContent(/5 athlètes/);
    expect(screen.getByTestId('assign-confirmation')).toHaveTextContent(/Groupe « Sprint élite »/);
  });

  it('récurrence (ADR-35) : « répéter chaque mardi » → envoie recurrence + confirmation N occurrences', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    // Le serveur matérialise 3 occurrences (séances distinctes) pour 1 athlète.
    mockAssignSession.mockResolvedValue({
      status: 201,
      data: {
        data: [
          { id: 'asg-1', athleteId: 'a-1', sessionId: 's-1' },
          { id: 'asg-2', athleteId: 'a-1', sessionId: 's-occ-2' },
          { id: 'asg-3', athleteId: 'a-1', sessionId: 's-occ-3' },
        ],
      },
    });
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    // L'option de répétition n'apparaît qu'avec une échéance valide.
    expect(screen.queryByTestId('assign-repeat-toggle')).toBeNull();
    fireEvent.changeText(screen.getByTestId('assign-due-date'), '2026-06-09'); // mardi
    const toggle = screen.getByTestId('assign-repeat-toggle');
    expect(toggle).toHaveTextContent(/chaque mardi/);

    fireEvent.press(toggle);
    fireEvent.changeText(screen.getByTestId('assign-repeat-until'), '2026-06-23');
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    fireEvent.press(screen.getByTestId('assign-submit'));

    await waitFor(() => expect(mockAssignSession).toHaveBeenCalled());
    const body = mockAssignSession.mock.calls[0][1];
    expect(body.dueDate).toBe('2026-06-09');
    expect(body.recurrence).toEqual({ frequency: 'weekly', until: '2026-06-23' });

    await waitFor(() => expect(screen.getByTestId('assign-confirmation')).toBeOnTheScreen());
    // 1 athlète, 3 occurrences.
    expect(screen.getByTestId('assign-confirmation-summary')).toHaveTextContent(/1 athlète/);
    expect(screen.getByTestId('assign-confirmation-summary')).toHaveTextContent(/répétée 3 fois/);
  });

  it('n’envoie pas recurrence si la case « répéter » est décochée', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockAssignSession.mockResolvedValue({
      status: 201,
      data: { data: [{ id: 'asg-a', athleteId: 'a-1', sessionId: 's-1' }] },
    });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('assign-due-date'), '2026-06-09');
    // Toggle disponible mais laissé décoché.
    expect(screen.getByTestId('assign-repeat-toggle')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    fireEvent.press(screen.getByTestId('assign-submit'));

    await waitFor(() => expect(mockAssignSession).toHaveBeenCalled());
    expect(mockAssignSession.mock.calls[0][1].recurrence).toBeUndefined();
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
