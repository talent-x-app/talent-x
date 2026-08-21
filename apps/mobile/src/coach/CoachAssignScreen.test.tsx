import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, Text } from 'react-native';

const mockGetCoachDashboard = jest.fn();
const mockAssignSession = jest.fn();
const mockListGroups = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockShow = jest.fn();
// Capture le dernier callback passé à useFocusEffect → permet de simuler une **ré-entrée** sur
// l'écran (persistant comme un tab caché) sans le remonter (TLX-257, même patron que TLX-93).
const mockFocusCb: { current: (() => void) | null } = { current: null };

jest.mock('@talent-x/api-client', () => ({
  getCoachDashboard: (...a: unknown[]) => mockGetCoachDashboard(...a),
  assignSession: (...a: unknown[]) => mockAssignSession(...a),
  listGroups: (...a: unknown[]) => mockListGroups(...a),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({ back: mockBack, replace: mockReplace }),
    // Comme le vrai useFocusEffect : exécute le callback au premier focus (≈ montage) ; on
    // mémorise le dernier pour rejouer une ré-entrée dans les tests.
    useFocusEffect: (cb: () => void) => {
      mockFocusCb.current = cb;
      React.useEffect(() => cb(), [cb]);
    },
  };
});
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

// Référence « aujourd'hui » fixée → le sélecteur de date (TLX-197) s'ouvre sur juin 2026.
const NOW = new Date('2026-06-15T00:00:00');

/** Sélectionne une date via le `DatePicker` : ouvre le calendrier puis presse la cellule du jour. */
function pickDate(testID: string, dayKey: string) {
  fireEvent.press(screen.getByTestId(testID));
  fireEvent.press(screen.getByTestId(`${testID}-cell-${dayKey}`));
}

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
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" now={NOW} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    fireEvent.press(screen.getByTestId('assign-athlete-a-2'));
    pickDate('assign-due-date', '2026-06-20');
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
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" now={NOW} />, {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    // L'option de répétition n'apparaît qu'avec une échéance valide.
    expect(screen.queryByTestId('assign-repeat-toggle')).toBeNull();
    pickDate('assign-due-date', '2026-06-09'); // mardi
    const toggle = screen.getByTestId('assign-repeat-toggle');
    expect(toggle).toHaveTextContent(/chaque mardi/);

    fireEvent.press(toggle);
    pickDate('assign-repeat-until', '2026-06-23');
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
    render(<CoachAssignScreen sessionId="s-1" now={NOW} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    pickDate('assign-due-date', '2026-06-09');
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

  it('« Assigner plus tard » (TLX-198) → va au détail de la séance, sans assigner', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-later')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-later'));

    // Pas d'assignation déclenchée ; navigation vers le détail (déjà enregistrée).
    expect(mockAssignSession).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/session/[id]',
        params: expect.objectContaining({ id: 's-1' }),
      }),
    );
  });

  it('changer de séance réinitialise l’état (pas de fuite de sélection/confirmation, via key)', async () => {
    // Reproduit le montage réel : la route remonte une instance par séance (`key={id}`).
    function KeyedHarness() {
      const [sid, setSid] = useState('s-1');
      return (
        <>
          <Pressable testID="harness-next-session" onPress={() => setSid('s-2')}>
            <Text>séance suivante</Text>
          </Pressable>
          <CoachAssignScreen key={sid} sessionId={sid} />
        </>
      );
    }
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<KeyedHarness />, { wrapper: Wrapper });

    // Séance 1 : on sélectionne un athlète.
    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    expect(screen.getByTestId('assign-submit')).toHaveTextContent('Assigner (1 cible)');

    // Nouvelle séance → instance neuve : la sélection ne fuit pas (bouton de nouveau désactivé).
    fireEvent.press(screen.getByTestId('harness-next-session'));
    await waitFor(() =>
      expect(screen.getByTestId('assign-submit')).toHaveTextContent(/sélectionne/i),
    );
    expect(screen.getByTestId('assign-submit')).toBeDisabled();
  });

  /**
   * TLX-257 — le cas que `key={id}` ne couvre pas. Le test voisin change de `sessionId` et passe
   * déjà aujourd'hui : il ne prouverait rien ici. Celui-ci reste sur **la même** séance, donc sur
   * la même instance jamais remontée, et rejoue une ré-entrée par le focus.
   */
  it('réaffecter la MÊME séance après « Terminé » : on retrouve le formulaire, pas la confirmation', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockListGroups.mockResolvedValue({ status: 200, data: GROUPS });
    mockAssignSession.mockResolvedValue({
      status: 201,
      data: { data: [{ id: 'asg-a', athleteId: 'a-1', sessionId: 's-1' }] },
    });
    render(<CoachAssignScreen sessionId="s-1" sessionTitle="Vitesse" now={NOW} />, {
      wrapper: Wrapper,
    });

    // Première affectation : un athlète, une échéance.
    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    pickDate('assign-due-date', '2026-06-20');
    fireEvent.press(screen.getByTestId('assign-submit'));
    await waitFor(() => expect(screen.getByTestId('assign-confirmation')).toBeOnTheScreen());

    // « Terminé » → retour. L'écran, lui, reste monté.
    fireEvent.press(screen.getByTestId('assign-done'));
    expect(mockBack).toHaveBeenCalled();
    expect(screen.getByTestId('assign-confirmation')).toBeOnTheScreen(); // toujours là, non démonté

    // Ré-entrée sur la même séance : le focus revient sans remontage (la clé n'a pas changé).
    act(() => mockFocusCb.current?.());

    // Le formulaire est de retour — c'est la DoD : le coach peut affecter à quelqu'un d'autre.
    await waitFor(() => expect(screen.getByTestId('assign-submit')).toBeOnTheScreen());
    expect(screen.queryByTestId('assign-confirmation')).toBeNull();
    // …et rien de la première affectation ne subsiste : ni sélection, ni échéance, ni récurrence.
    // Une sélection rémanente serait pire que l'écran bloqué : silencieuse.
    expect(screen.getByTestId('assign-submit')).toHaveTextContent(/sélectionne/i);
    expect(screen.getByTestId('assign-submit')).toBeDisabled();
    expect(screen.getByTestId('assign-due-date')).not.toHaveTextContent('2026-06-20');
  });

  it('une sortie sans affectation ne vide pas une sélection en cours (TLX-257)', async () => {
    // La remise à zéro est conditionnée au parcours **terminé** : sans cette garde, revenir sur
    // l'écran après un aller-retour quelconque effacerait le travail en cours du coach.
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAssignScreen sessionId="s-1" now={NOW} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-athlete-a-1'));
    expect(screen.getByTestId('assign-submit')).toHaveTextContent('Assigner (1 cible)');

    act(() => mockFocusCb.current?.());

    expect(screen.getByTestId('assign-submit')).toHaveTextContent('Assigner (1 cible)');
  });

  it('échéance pré-remplie depuis la date planifiée de la séance (defaultDueDate)', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAssignScreen sessionId="s-1" defaultDueDate="2026-07-25" />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('assign-due-date')).toBeOnTheScreen());
    // Le sélecteur s'ouvre sur le mois de la valeur pré-remplie, avec ce jour marqué sélectionné.
    fireEvent.press(screen.getByTestId('assign-due-date'));
    expect(
      screen.getByTestId('assign-due-date-cell-2026-07-25').props.accessibilityState.selected,
    ).toBe(true);
  });

  it('« Retour » post-création (fromCreate) sort vers l’accueil, pas router.back (TLX-198 nav)', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAssignScreen sessionId="s-1" fromCreate />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-back')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-back'));

    // Déterministe : on ne fait pas router.back() (qui retomberait dans la création), on va à l'accueil.
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(coach)');
  });

  it('« Retour » hors création (depuis le détail) reste un router.back classique', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-back')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('« Assigner plus tard » reste l’échappatoire même sans athlète lié (impasse évitée)', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: { ...DASHBOARD, athletes: [], summary: { ...DASHBOARD.summary, athleteCount: 0 } },
    });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-empty')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('assign-later'));
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ id: 's-1' }) }),
    );
  });

  it('état erreur si le chargement des athlètes échoue', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachAssignScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('assign-error')).toBeOnTheScreen());
  });
});
