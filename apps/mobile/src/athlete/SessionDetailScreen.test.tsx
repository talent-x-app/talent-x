import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetAssignment = jest.fn();
const mockGetPerformance = jest.fn();
const mockSubmitPerformance = jest.fn();
const mockUpdatePerformance = jest.fn();
const mockListComments = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getAssignment: (...a: unknown[]) => mockGetAssignment(...a),
  getPerformance: (...a: unknown[]) => mockGetPerformance(...a),
  submitPerformance: (...a: unknown[]) => mockSubmitPerformance(...a),
  updatePerformance: (...a: unknown[]) => mockUpdatePerformance(...a),
  listComments: (...a: unknown[]) => mockListComments(...a),
  createComment: jest.fn(),
  getCoachDashboard: jest.fn(),
  updateAssignment: jest.fn(),
  deleteAssignment: jest.fn(),
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
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
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
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: 'as-1' }),
}));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  useNetworkStatus: () => true,
}));
jest.mock('../offline', () => ({
  deviceStore: {},
  loadDraft: jest.fn().mockResolvedValue(null),
  loadOutbox: jest.fn().mockResolvedValue([]),
  findOutboxItem: jest.fn(() => undefined),
  saveDraft: jest.fn().mockResolvedValue(undefined),
  clearDraft: jest.fn().mockResolvedValue(undefined),
  enqueuePerf: jest.fn().mockResolvedValue([]),
}));

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

beforeEach(() => {
  jest.clearAllMocks();
  mockListComments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
});

describe('SessionDetailScreen (TLX-065/071 — A-03/A-04)', () => {
  /** Bascule de la lecture seule (défaut) vers la saisie de perf (A-04). */
  async function enterEntryMode() {
    fireEvent.press(await screen.findByTestId('start-perf-entry'));
  }

  it('affiche la séance en lecture seule par défaut (consultation, sans saisie)', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('session-detail-title')).toHaveTextContent('Haut du corps'),
    );
    expect(screen.getByTestId('exercise-0')).toHaveTextContent(/Développé couché/);
    expect(screen.getByTestId('exercise-1')).toHaveTextContent(/Tractions/);
    // Lecture seule : CTA « Saisir ma performance », pas de bouton de soumission ni de RPE.
    expect(screen.getByTestId('start-perf-entry')).toHaveTextContent(/Saisir ma performance/);
    expect(screen.queryByTestId('submit-performance')).toBeNull();
    expect(screen.queryByTestId('rpe-slider')).toBeNull();

    // Bascule en saisie → la soumission et le RPE apparaissent.
    await enterEntryMode();
    expect(screen.getByTestId('submit-performance')).toHaveTextContent('Enregistrer ma perf');
    expect(screen.getByTestId('rpe-slider')).toBeOnTheScreen();
  });

  it('expose la discussion de séance avant la saisie (TLX-118)', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('feedback-input')).toBeOnTheScreen());
    // Fil ciblant la séance (pas une perf, qui n'existe pas encore).
    expect(screen.getByText('Discussion')).toBeOnTheScreen();
    expect(mockListComments).toHaveBeenCalledWith({ sessionId: 's-1' });
  });

  it('affiche la cible dérivée des params typés d’un bloc (TLX-062)', async () => {
    mockGetAssignment.mockResolvedValue({
      status: 200,
      data: {
        ...ASSIGNMENT,
        session: {
          ...ASSIGNMENT.session,
          exercises: {
            schemaVersion: 2,
            items: [
              {
                name: '6 × 400m',
                order: 0,
                type: 'interval',
                params: { reps: 6, workSeconds: 90, recoverySeconds: 120 },
              },
              {
                name: 'Gainage',
                order: 1,
                type: 'core',
                params: { rounds: 3, stationSeconds: 45 },
              },
            ],
          },
        },
      },
    });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('exercise-0-target')).toBeOnTheScreen());
    expect(screen.getByTestId('exercise-0-target')).toHaveTextContent('6 × 90s · récup 120s');
    expect(screen.getByTestId('exercise-1-target')).toHaveTextContent('3 tours × 45s');
  });

  it('groupe d’exercices (ADR-27) : en-tête « N tours », membres A1/A2, checklist multi-tours sérialisée par feuille', async () => {
    mockGetAssignment.mockResolvedValue({
      status: 200,
      data: {
        ...ASSIGNMENT,
        session: {
          ...ASSIGNMENT.session,
          exercises: {
            schemaVersion: 2,
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
        },
      },
    });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    mockSubmitPerformance.mockResolvedValue({ status: 201, data: { id: 'p-1' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });
    await enterEntryMode();

    // En-tête de groupe : nom + « 3 tours ».
    await waitFor(() => expect(screen.getByTestId('group-0')).toBeOnTheScreen());
    expect(screen.getByTestId('group-0')).toHaveTextContent(/Contraste/);
    expect(screen.getByTestId('group-0-rounds')).toHaveTextContent('3 tours');
    // Compteur de feuilles : 3 (1 simple + 2 membres), pas 2 nœuds.
    expect(screen.getByTestId('exercise-count')).toHaveTextContent(/0\/3/);
    // Membres de superset étiquetés A1/A2, indexés à plat (leafIndex 1 et 2).
    expect(screen.getByTestId('exercise-1')).toHaveTextContent(/A1 · Squat/);
    expect(screen.getByTestId('exercise-2')).toHaveTextContent(/A2 · Bonds/);

    // Membre de groupe → checklist multi-tours (une case « Tour k » par tour).
    fireEvent.press(screen.getByTestId('exercise-1-round-0')); // Squat tour 1
    fireEvent.press(screen.getByTestId('exercise-1-round-2')); // Squat tour 3 (saute le 2)
    fireEvent.press(screen.getByTestId('submit-performance'));

    await waitFor(() => expect(mockSubmitPerformance).toHaveBeenCalled());
    const [, body] = mockSubmitPerformance.mock.calls[0];
    expect(body.results.items).toHaveLength(3); // une entrée par feuille
    const squat = body.results.items.find(
      (r: { exerciseName: string }) => r.exerciseName === 'Squat',
    );
    // Tour sauté préservé en position (set 2 completed:false), ADR-27.
    expect(squat.setResults).toEqual([
      { set: 1, completed: true },
      { set: 2, completed: false },
      { set: 3, completed: true },
    ]);
  });

  it('mode Temps : lignes pré-remplies depuis params.reps, sérialise timeSeconds v2 (TLX-072/073)', async () => {
    mockGetAssignment.mockResolvedValue({
      status: 200,
      data: {
        ...ASSIGNMENT,
        session: {
          ...ASSIGNMENT.session,
          exercises: {
            schemaVersion: 2,
            items: [
              {
                name: '3 × 400m',
                order: 1,
                type: 'interval',
                params: { reps: 3, workSeconds: 75 },
              },
            ],
          },
        },
      },
    });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    mockSubmitPerformance.mockResolvedValue({ status: 201, data: { id: 'p-1' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });
    await enterEntryMode();

    // 3 lignes de temps pré-créées depuis la cible (params.reps).
    await waitFor(() => expect(screen.getByTestId('exercise-0-time-0')).toBeOnTheScreen());
    expect(screen.getByTestId('exercise-0-time-2')).toBeOnTheScreen();
    expect(screen.queryByTestId('exercise-0-time-3')).toBeNull();

    fireEvent.changeText(screen.getByTestId('exercise-0-time-0'), '1:15.3');
    fireEvent.changeText(screen.getByTestId('exercise-0-time-1'), '76,1');
    fireEvent.press(screen.getByTestId('submit-performance'));

    await waitFor(() => expect(mockSubmitPerformance).toHaveBeenCalled());
    const body = mockSubmitPerformance.mock.calls[0][1];
    expect(body.results.schemaVersion).toBe(2);
    expect(body.results.items[0].setResults).toEqual([
      { set: 1, timeSeconds: 75.3, completed: true },
      { set: 2, timeSeconds: 76.1, completed: true },
    ]);
  });

  it('mode Essais distance : distance + mordu, sérialise distanceMeters/failed v2 (TLX-074)', async () => {
    mockGetAssignment.mockResolvedValue({
      status: 200,
      data: {
        ...ASSIGNMENT,
        session: {
          ...ASSIGNMENT.session,
          exercises: {
            schemaVersion: 2,
            items: [{ name: 'Longueur', order: 1, type: 'jumps', params: { fullJumps: 2 } }],
          },
        },
      },
    });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    mockSubmitPerformance.mockResolvedValue({ status: 201, data: { id: 'p-1' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });
    await enterEntryMode();

    await waitFor(() => expect(screen.getByTestId('exercise-0-distance-0')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('exercise-0-distance-0'), '6.42');
    fireEvent.press(screen.getByTestId('exercise-0-failed-1')); // essai 2 mordu
    fireEvent.press(screen.getByTestId('submit-performance'));

    await waitFor(() => expect(mockSubmitPerformance).toHaveBeenCalled());
    const body = mockSubmitPerformance.mock.calls[0][1];
    expect(body.results.items[0].setResults).toEqual([
      { set: 1, distanceMeters: 6.42, completed: true },
      { set: 2, failed: true, completed: true },
    ]);
  });

  it('mode Grille de barres : barre pré-remplie, cycle d’essai, sérialise distanceMeters/failed v2 (TLX-075)', async () => {
    mockGetAssignment.mockResolvedValue({
      status: 200,
      data: {
        ...ASSIGNMENT,
        session: {
          ...ASSIGNMENT.session,
          exercises: {
            schemaVersion: 2,
            items: [
              {
                name: 'Hauteur',
                order: 1,
                type: 'vertical_jumps',
                params: { discipline: 'high', startHeightCm: 175, incrementCm: 5 },
              },
            ],
          },
        },
      },
    });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    mockSubmitPerformance.mockResolvedValue({ status: 201, data: { id: 'p-1' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });
    await enterEntryMode();

    // 1ʳᵉ barre pré-remplie à 1.75 m (175 cm), cible affichée.
    await waitFor(() => expect(screen.getByTestId('exercise-0-bar-0-height')).toBeOnTheScreen());
    expect(screen.getByTestId('exercise-0-bar-0-height').props.value).toBe('1.75');
    expect(screen.getByTestId('exercise-0-target')).toHaveTextContent(
      'Hauteur · départ 1.75 m · +5 cm',
    );

    // Barre 1 : 1er essai franchi (O). Barre 2 (1.8 m) : 1er essai échoué (X) puis 2e franchi.
    fireEvent.press(screen.getByTestId('exercise-0-bar-0-attempt-0')); // none → cleared
    fireEvent.press(screen.getByTestId('exercise-0-bar-1-attempt-0')); // none → cleared
    fireEvent.press(screen.getByTestId('exercise-0-bar-1-attempt-0')); // cleared → failed
    fireEvent.press(screen.getByTestId('exercise-0-bar-1-attempt-1')); // none → cleared
    fireEvent.press(screen.getByTestId('submit-performance'));

    await waitFor(() => expect(mockSubmitPerformance).toHaveBeenCalled());
    const body = mockSubmitPerformance.mock.calls[0][1];
    expect(body.results.items[0].setResults).toEqual([
      { set: 1, distanceMeters: 1.75, completed: true },
      { set: 2, distanceMeters: 1.8, failed: true, completed: true },
      { set: 3, distanceMeters: 1.8, completed: true },
    ]);
  });

  it('réhydrate les temps mesurés d’une perf existante (mise à jour)', async () => {
    mockGetAssignment.mockResolvedValue({
      status: 200,
      data: {
        ...ASSIGNMENT,
        session: {
          ...ASSIGNMENT.session,
          exercises: {
            schemaVersion: 2,
            items: [{ name: '60m', order: 1, type: 'sprint', params: { reps: 2 } }],
          },
        },
      },
    });
    mockGetPerformance.mockResolvedValue({
      status: 200,
      data: {
        id: 'p-1',
        assignmentId: 'as-1',
        athleteId: 'me',
        rpe: 8,
        submittedAt: '2026-06-10T10:00:00.000Z',
        results: {
          schemaVersion: 2,
          items: [
            {
              exerciseName: '60m',
              order: 1,
              setResults: [{ set: 1, timeSeconds: 7.45, completed: true }],
            },
          ],
        },
      },
    });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('session-detail-saved')).toBeOnTheScreen());
    await enterEntryMode();
    expect(screen.getByTestId('exercise-0-time-0').props.value).toBe('7.45');
  });

  it('soumet la perf avec en-tête Idempotency-Key et résultats par exercice', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    mockSubmitPerformance.mockResolvedValue({ status: 201, data: { id: 'p-1' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await enterEntryMode();
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
    // 1re soumission → bascule sur la confirmation A-05 (TLX-078).
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(athlete)/perf/[id]',
        params: { id: 'as-1' },
      }),
    );
  });

  it('affiche un message dédié quand le consentement manque', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    mockSubmitPerformance.mockResolvedValue({ status: 403, data: { error: 'CONSENT_REQUIRED' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await enterEntryMode();
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
    // Lecture seule : le CTA invite à modifier la perf existante.
    expect(screen.getByTestId('start-perf-entry')).toHaveTextContent(/Modifier ma performance/);

    await enterEntryMode();
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

  it('affiche le brief : métriques, consigne en une phrase, carte Réussi/Stop (ADR-28)', async () => {
    mockGetAssignment.mockResolvedValue({
      status: 200,
      data: {
        ...ASSIGNMENT,
        session: {
          ...ASSIGNMENT.session,
          brief: {
            schemaVersion: 1,
            athleteIntent: 'Cours vite et relâché.',
            durationMinutes: 75,
            difficulty: 7,
            successCriteria: 'Tenir les 16 efforts au même rythme.',
            stopCriteria: "Ta foulée s'écrase.",
          },
        },
      },
    });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('brief-metrics')).toBeOnTheScreen());
    expect(screen.getByTestId('brief-metric-duration-value')).toHaveTextContent('75 min');
    expect(screen.getByTestId('brief-metric-exercises-value')).toHaveTextContent('2');
    expect(screen.getByTestId('brief-metric-difficulty-value')).toHaveTextContent('7/10');
    expect(screen.getByTestId('brief-athlete-intent')).toHaveTextContent(/Cours vite et relâché\./);
    expect(screen.getByTestId('brief-success')).toHaveTextContent(
      /Tenir les 16 efforts au même rythme\./,
    );
    expect(screen.getByTestId('brief-stop')).toHaveTextContent(/Ta foulée s'écrase\./);
  });

  it('séance sans brief : métriques présentes, ni consigne ni carte Réussi/Stop (rétro-compat)', async () => {
    mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
    mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('brief-metrics')).toBeOnTheScreen());
    expect(screen.getByTestId('brief-metric-difficulty-value')).toHaveTextContent('—');
    expect(screen.queryByTestId('brief-athlete-intent')).toBeNull();
    expect(screen.queryByTestId('brief-success-stop')).toBeNull();
  });
});
