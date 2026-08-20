import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetSession = jest.fn();
const mockListComments = jest.fn();
const mockCreateComment = jest.fn();
const mockListAssignments = jest.fn();
const mockGetCoachDashboard = jest.fn();
const mockDeleteSession = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getSession: (...a: unknown[]) => mockGetSession(...a),
  listComments: (...a: unknown[]) => mockListComments(...a),
  createComment: (...a: unknown[]) => mockCreateComment(...a),
  listAssignments: (...a: unknown[]) => mockListAssignments(...a),
  getCoachDashboard: (...a: unknown[]) => mockGetCoachDashboard(...a),
  deleteSession: (...a: unknown[]) => mockDeleteSession(...a),
  SessionStatus: { draft: 'draft', published: 'published', archived: 'archived' },
  CompetitionStatus: { draft: 'draft', published: 'published', archived: 'archived' },
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
  BlockType: {
    strength: 'strength',
    interval: 'interval',
    sprint: 'sprint',
    endurance: 'endurance',
    hurdles: 'hurdles',
    jumps: 'jumps',
    vertical_jumps: 'vertical_jumps',
    throws: 'throws',
    core: 'core',
    warmup: 'warmup',
    cooldown: 'cooldown',
    custom: 'custom',
  },
  LoadUnit: { kg: 'kg', lb: 'lb', percent_1rm: 'percent_1rm', bodyweight: 'bodyweight' },
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
// Mutable : `coach/session/[id]` est un écran d'onglet masqué que React Navigation ne démonte
// jamais. Changer d'`id` sans remonter le composant est donc le scénario réel (TLX-245).
let mockRouteId = 's-1';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: mockRouteId }),
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }) }));

import { CoachSessionDetailScreen } from './CoachSessionDetailScreen';

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

const SESSION = {
  id: 's-1',
  title: 'Contraste & vitesse',
  description: 'Séance à groupes',
  status: 'published',
  coachId: 'c-1',
  exercises: {
    schemaVersion: 3,
    items: [
      { name: 'Échauffement', order: 0, type: 'warmup' },
      {
        kind: 'group',
        name: 'Contraste',
        order: 1,
        groupType: 'superset',
        rounds: 3,
        items: [
          { name: 'Squat', order: 1, type: 'strength' },
          { name: 'Bonds', order: 2, type: 'custom' },
        ],
      },
    ],
  },
  brief: {
    difficulty: 8,
    intent: 'Travail de pied de force',
    athleteIntent: 'Explose à chaque tour',
  },
};

/**
 * Rendu avec un client **accessible au test** : TLX-245 ne se reproduit que si la séance
 * suivante est déjà dans le cache, condition qu'on doit pouvoir poser explicitement.
 */
function renderWithClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Fourni via l'option `wrapper` : RNTL le réapplique au `rerender`, là où un arbre passé en
  // élément racine repartirait sans ses providers.
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
  const view = render(<CoachSessionDetailScreen />, { wrapper });
  return { ...view, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteId = 's-1';
  mockListComments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
  // Défauts : aucune affectation, aucun athlète lié (les tests dédiés surchargent).
  mockListAssignments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
  mockGetCoachDashboard.mockResolvedValue({ status: 200, data: { athletes: [] } });
  mockDeleteSession.mockResolvedValue({ status: 204 });
});

describe('CoachSessionDetailScreen (C-05 — détail lecture seule)', () => {
  it('rend la séance en lecture seule : statut, brief coach, groupes (sans saisie)', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-session-title')).toHaveTextContent('Contraste & vitesse'),
    );
    expect(screen.getByTestId('coach-session-status')).toHaveTextContent('Publiée');
    // Lecture coach du brief (intent) + contenu partagé (groupe 3 tours, A1/A2).
    expect(screen.getByText('Travail de pied de force')).toBeOnTheScreen();
    expect(screen.getByTestId('group-0-rounds')).toHaveTextContent('3 tours');
    // Échauffement rendu en encart de phase (TLX-171), donc Squat = feuille 0 (A1).
    expect(screen.getByTestId('session-phase-warmup')).toBeOnTheScreen();
    expect(screen.getByTestId('exercise-0')).toHaveTextContent(/A1 · Squat/);
    // Pas de saisie de perf.
    expect(screen.queryByTestId('submit-performance')).toBeNull();
  });

  it('actions : Éditer → constructeur, Assigner → écran d’assignation', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-session-edit')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('coach-session-edit'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(coach)/session/[id]/edit', params: { id: 's-1' } }),
    );

    fireEvent.press(screen.getByTestId('coach-session-assign'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(coach)/assign/[id]' }),
    );
  });

  it('état erreur si la séance ne charge pas', async () => {
    mockGetSession.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-session-error')).toBeOnTheScreen());
  });

  it('ADR-40 §3 : discipline reconnue (haies) → résumé compatible carte dédiée', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        ...SESSION,
        exercises: {
          schemaVersion: 3,
          items: [
            {
              kind: 'group',
              name: 'Série haies',
              order: 0,
              groupType: 'series',
              rounds: 2,
              items: [
                { name: '10 haies', order: 0, type: 'hurdles', params: { distanceMeters: 110 } },
                { name: '10 haies', order: 1, type: 'hurdles', params: { distanceMeters: 110 } },
              ],
            },
          ],
        },
      },
    });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-session-discipline-summary')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('coach-session-discipline-summary')).toHaveTextContent(/Haies/);
  });

  it('ADR-41 §6 : séance renforcement (strength) → résumé discipline « Renforcement / PPG »', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        ...SESSION,
        exercises: {
          schemaVersion: 3,
          items: [
            { name: 'Squat', order: 0, type: 'strength', sets: 4, reps: 5, params: {} },
            { name: 'Développé couché', order: 1, type: 'strength', sets: 4, reps: 10, params: {} },
          ],
        },
      },
    });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-session-discipline-summary')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('coach-session-discipline-summary')).toHaveTextContent(
      /Renforcement \/ PPG/,
    );
  });

  it('ADR-40 §3 : structure non inférable (groupes hétérogènes) → pas de résumé, rendu inchangé', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-session-title')).toHaveTextContent('Contraste & vitesse'),
    );
    expect(screen.queryByTestId('coach-session-discipline-summary')).toBeNull();
  });

  /**
   * ADR-42 §4 — séance composite : pas de discipline unique inférable, mais une structure
   * lisible bloc par bloc. Ce repli n'était rendu par aucun test (TLX-254) : le seul cas non
   * inférable couvert vérifiait l'**absence** du résumé de discipline, jamais la présence de
   * ce qui le remplace. C'est précisément le rendu qui évite au coach une liste plate.
   */
  it('ADR-42 §4 : séance composite → récap par bloc (discipline reconnue + repli « Personnalisé »)', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        ...SESSION,
        exercises: {
          schemaVersion: 3,
          items: [
            { name: '60 m', order: 0, type: 'sprint', params: { distanceMeters: 60 } },
            { name: '80 m', order: 1, type: 'sprint', params: { distanceMeters: 80 } },
            // Rupture de discipline → second segment, et le rendu bascule sur le récap par bloc.
            { name: 'Squat', order: 2, type: 'strength', sets: 4, reps: 5, params: {} },
          ],
        },
      },
    });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-session-bloc-0')).toBeOnTheScreen());
    expect(screen.getByTestId('coach-session-bloc-1')).toBeOnTheScreen();
    expect(screen.getByText('2 blocs')).toBeOnTheScreen();
    // Pas de résumé de discipline : c'est bien le repli composite qui est rendu.
    expect(screen.queryByTestId('coach-session-discipline-summary')).toBeNull();
  });

  /**
   * La section « Assigné à » joint deux requêtes (affectations + noms via le dashboard). Leurs
   * chemins d'échec n'étaient pas couverts (TLX-254) : un coach hors ligne ne doit pas voir
   * l'écran casser, ni une liste d'athlètes anonymes présentée comme complète.
   */
  it('« Assigné à » : échec de chargement → la séance reste lisible, sans section fantôme', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    mockListAssignments.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    mockGetCoachDashboard.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-session-title')).toHaveTextContent('Contraste & vitesse'),
    );
    // Le reste de l'écran tient : le détail d'une séance ne dépend pas de ses affectations.
    expect(screen.getByTestId('coach-session-delete')).toBeOnTheScreen();
    expect(screen.queryByTestId('assigned-athlete-a-1')).toBeNull();
  });

  it('TLX-193 : section « Assigné à » — noms (via dashboard) + statut d’affectation', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          { id: 'asg-1', sessionId: 's-1', athleteId: 'a-1', status: 'completed' },
          { id: 'asg-2', sessionId: 's-1', athleteId: 'a-2', status: 'assigned' },
        ],
        meta: {},
      },
    });
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: {
        athletes: [
          { id: 'a-1', firstName: 'Nina', lastName: 'Koné', status: 'up_to_date' },
          { id: 'a-2', firstName: 'Tom', lastName: 'Bah', status: 'late' },
        ],
      },
    });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-session-assignee-a-1')).toBeOnTheScreen());
    // Filtre par séance transmis au contrat (TLX-193).
    expect(mockListAssignments).toHaveBeenCalledWith({ sessionId: 's-1' });
    // Noms joints depuis le dashboard (nœuds texte propres) + badge de statut d'affectation.
    expect(screen.getByText('Nina Koné')).toBeOnTheScreen();
    expect(screen.getByText('Tom Bah')).toBeOnTheScreen();
    expect(screen.getByTestId('assignment-status-completed')).toBeOnTheScreen(); // a-1 « Réalisée »
    expect(screen.getByTestId('assignment-status-assigned')).toBeOnTheScreen(); // a-2 « À faire »
  });

  it('TLX-193 : séance non assignée → état vide « Pas encore assignée »', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-session-assignees-empty')).toBeOnTheScreen(),
    );
  });

  it('TLX-194 : supprimer la séance (confirmation inline → DELETE → retour)', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-session-delete')).toBeOnTheScreen());
    // Pas de suppression directe : confirmation requise.
    fireEvent.press(screen.getByTestId('coach-session-delete'));
    expect(mockDeleteSession).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('coach-session-delete-confirm'));
    await waitFor(() => expect(mockDeleteSession).toHaveBeenCalledWith('s-1'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('TLX-194 : « Annuler » la suppression ne supprime pas', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-session-delete')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('coach-session-delete'));
    fireEvent.press(screen.getByText('Annuler'));
    // Retour à l'état initial : bouton Supprimer de nouveau visible, aucun appel DELETE.
    expect(screen.getByTestId('coach-session-delete')).toBeOnTheScreen();
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  /**
   * TLX-245 — `coach/session/[id]` est un `Tabs.Screen … href: null`, jamais démonté : une
   * confirmation de suppression ouverte puis abandonnée survivait au changement de route et
   * se rouvrait sur la séance **suivante**, `deleteSession` visant alors l'`id` courant.
   *
   * La condition de reproduction n'est pas anodine et explique que le scénario n'ait jamais
   * été vu sur appareil : si la séance suivante n'est **pas** en cache, `session.isLoading`
   * repasse à vrai, le bloc entier se démonte et la confirmation retombe d'elle-même. Le
   * défaut n'existe que sur une séance déjà visitée — d'où le cache pré-rempli ci-dessous.
   */
  describe('confirmation de suppression sur un écran jamais démonté (TLX-245)', () => {
    const SESSION_B = { ...SESSION, id: 's-2', title: 'Endurance longue' };

    it('changer de séance ferme la confirmation restée armée', async () => {
      mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
      const view = renderWithClient();

      await waitFor(() => expect(screen.getByTestId('coach-session-delete')).toBeOnTheScreen());
      fireEvent.press(screen.getByTestId('coach-session-delete'));
      expect(screen.getByTestId('coach-session-delete-confirm')).toBeOnTheScreen();

      // La séance B a déjà été visitée : elle est en cache, donc aucun état de chargement ne
      // vient démonter le bloc — c'est très exactement la fenêtre du défaut.
      view.queryClient.setQueryData(['session', 's-2'], SESSION_B);
      mockGetSession.mockResolvedValue({ status: 200, data: SESSION_B });
      mockRouteId = 's-2';
      view.rerender(<CoachSessionDetailScreen />);

      await waitFor(() =>
        expect(screen.getByTestId('coach-session-title')).toHaveTextContent('Endurance longue'),
      );
      // Sans correctif, la confirmation s'affichait sur B sans que le coach l'ait demandée —
      // et un appui aurait supprimé B.
      expect(screen.queryByTestId('coach-session-delete-confirm')).toBeNull();
      expect(screen.getByTestId('coach-session-delete')).toBeOnTheScreen();
      expect(mockDeleteSession).not.toHaveBeenCalled();
    });

    it('la suppression reste opérante après un changement de séance (non-régression)', async () => {
      mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
      const view = renderWithClient();
      await waitFor(() => expect(screen.getByTestId('coach-session-delete')).toBeOnTheScreen());

      view.queryClient.setQueryData(['session', 's-2'], SESSION_B);
      mockGetSession.mockResolvedValue({ status: 200, data: SESSION_B });
      mockRouteId = 's-2';
      view.rerender(<CoachSessionDetailScreen />);

      await waitFor(() =>
        expect(screen.getByTestId('coach-session-title')).toHaveTextContent('Endurance longue'),
      );
      fireEvent.press(screen.getByTestId('coach-session-delete'));
      fireEvent.press(screen.getByTestId('coach-session-delete-confirm'));

      // La cible suit bien la route : c'est B qu'on supprime, après l'avoir demandé sur B.
      await waitFor(() => expect(mockDeleteSession).toHaveBeenCalledWith('s-2'));
    });
  });

  it('expose la discussion de séance (TLX-118) : poste sur la séance', async () => {
    mockGetSession.mockResolvedValue({ status: 200, data: SESSION });
    mockCreateComment.mockResolvedValue({ status: 201, data: { id: 'cs-1' } });
    render(<CoachSessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('feedback-input')).toBeOnTheScreen());
    expect(mockListComments).toHaveBeenCalledWith({ sessionId: 's-1' });
    fireEvent.changeText(screen.getByTestId('feedback-input'), 'Pensez à la mobilité.');
    fireEvent.press(screen.getByTestId('feedback-send'));
    await waitFor(() => expect(mockCreateComment).toHaveBeenCalled());
    expect(mockCreateComment).toHaveBeenCalledWith({
      sessionId: 's-1',
      body: 'Pensez à la mobilité.',
    });
  });
});
