import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockCreateSession = jest.fn();
const mockGetSession = jest.fn();
const mockUpdateSession = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockShow = jest.fn();
// Capture le dernier callback passé à useFocusEffect → permet de simuler un retour de
// focus sur l'écran (persistant comme un tab caché) sans le remonter (TLX-93).
const mockFocusCb: { current: (() => void) | null } = { current: null };

jest.mock('@talent-x/api-client', () => ({
  createSession: (...a: unknown[]) => mockCreateSession(...a),
  getSession: (...a: unknown[]) => mockGetSession(...a),
  updateSession: (...a: unknown[]) => mockUpdateSession(...a),
  SessionStatus: {
    draft: 'draft',
    published: 'published',
    archived: 'archived',
    template: 'template',
  },
  LoadUnit: { kg: 'kg', lb: 'lb', percent_1rm: 'percent_1rm', bodyweight: 'bodyweight' },
  // Importé transitivement via navigation.ts → athlete-ui (helper assignSessionHref).
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
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useRouter: () => ({ back: mockBack, replace: mockReplace, push: mockPush }),
    // Comme le vrai useFocusEffect : exécute le callback au montage (≈ premier focus) ;
    // on mémorise aussi le dernier callback pour rejouer un focus dans les tests.
    useFocusEffect: (cb: () => void) => {
      mockFocusCb.current = cb;
      React.useEffect(() => cb(), [cb]);
    },
  };
});
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { SessionBuilderScreen } from './SessionBuilderScreen';
import { BlockType } from '@talent-x/api-client';
import { makeBlock, makeSeriesGroup } from './session-builder-ui';

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

beforeEach(() => jest.clearAllMocks());

describe('SessionBuilderScreen (TLX-052 — C-05)', () => {
  it('rend le mode création avec un bloc vide', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Nouvelle séance');
    expect(screen.getByTestId('block-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('block-1')).toBeNull();
  });

  it('création : repart d’un formulaire vierge à chaque focus (TLX-93)', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    // Le coach saisit un brouillon puis ajoute un 2ᵉ bloc.
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Brouillon résiduel');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Squat arrière');
    fireEvent.press(screen.getByTestId('session-add-block'));
    expect(screen.getByTestId('block-1')).toBeOnTheScreen();

    // Il quitte le constructeur et y revient (l'écran-tab caché reste monté) → re-focus.
    act(() => mockFocusCb.current?.());

    expect(screen.getByTestId('session-field-title').props.value).toBe('');
    expect(screen.getByTestId('block-0-name').props.value).toBe('');
    expect(screen.queryByTestId('block-1')).toBeNull();
  });

  it('refuse la sauvegarde sans titre', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('session-save'));
    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(/titre/i);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuse la sauvegarde si un bloc est sans nom', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse');
    fireEvent.press(screen.getByTestId('session-save'));
    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(/bloc 1/i);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuse la sauvegarde d’une séance sans aucun exercice (TLX-172 #6)', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vide');
    // Supprime l'unique bloc → séance sans exercice.
    fireEvent.press(screen.getByTestId('composite-bloc-0-delete'));
    fireEvent.press(screen.getByTestId('session-save'));
    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(
      /au moins un exercice/i,
    );
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuse un bloc chronométré sans le param de suivi (distance) (TLX-91)', () => {
    // La garde de suivi vit dans l'écran (validation de `nodes` à la sauvegarde) ; on amorce
    // directement un bloc sprint sans distance via `seed` (le choix de type lui-même est couvert
    // au niveau `GenericBlocksEditor`).
    render(
      <SessionBuilderScreen
        seed={() => [makeBlock({ type: BlockType.sprint, name: '8 × 60m' })]}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse');
    // Distance absente → la perf serait invisible en progression : on bloque.
    fireEvent.press(screen.getByTestId('session-save'));
    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(/distance/i);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('refuse la sauvegarde si la date prévue est malformée (TLX-167)', async () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Footing');
    // Jour impossible : la regex seule l'aurait laissé filer en 400 serveur opaque.
    fireEvent.changeText(screen.getByTestId('session-field-date'), '2026-02-30');
    fireEvent.press(screen.getByTestId('session-save'));
    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(/date valide/i);
    expect(mockCreateSession).not.toHaveBeenCalled();

    // Corrigée en une vraie date → l'enregistrement passe et la date est sérialisée.
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-date' } });
    fireEvent.changeText(screen.getByTestId('session-field-date'), '2026-06-20');
    fireEvent.press(screen.getByTestId('session-save'));
    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    expect(mockCreateSession.mock.calls[0][0].scheduledDate).toBe('2026-06-20');
  });

  it('ajoute et supprime des blocs', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('session-add-block'));
    expect(screen.getByTestId('block-1')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('block-1-remove'));
    expect(screen.queryByTestId('block-1')).toBeNull();
  });

  // Le masquage de champ de base et la non-fuite des champs masqués (TLX-94), ainsi que toute la
  // sérialisation par type de bloc (TLX-053→061), sont désormais couverts au niveau du composant
  // `GenericBlocksEditor` (generic-blocks-editor.test.tsx) : dès qu'un bloc reçoit un type de
  // discipline reconnue, il quitte l'éditeur générique pour sa carte dédiée dans le composite
  // (ADR-42). On garde ici les parcours écran (sauvegarde, validation, routage, brief).

  it('crée une séance avec le document exercises v1 (order, nombres, charge)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-new' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), '  Vitesse — départs  ');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Squat arrière');
    fireEvent.changeText(screen.getByTestId('block-0-sets'), '5');
    fireEvent.changeText(screen.getByTestId('block-0-reps'), '3');
    fireEvent.changeText(screen.getByTestId('block-0-load'), '80');
    fireEvent.press(screen.getByTestId('block-0-unit-kg'));
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    expect(mockCreateSession).toHaveBeenCalledWith({
      title: 'Vitesse — départs',
      description: undefined,
      scheduledDate: undefined,
      status: 'draft',
      exercises: {
        schemaVersion: 3,
        items: [
          {
            name: 'Squat arrière',
            order: 1,
            sets: 5,
            reps: 3,
            load: { value: 80, unit: 'kg' },
          },
        ],
      },
    });
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    );
    // Création → bascule sur l'écran d'assignation de la séance créée (C-06, TLX-063).
    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/assign/[id]',
        params: expect.objectContaining({ id: 's-new' }),
      }),
    );
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("n'attache pas de charge si l'unité n'est pas choisie", async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-new' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Endurance');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Footing');
    fireEvent.changeText(screen.getByTestId('block-0-load'), '80'); // valeur sans unité
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const body = mockCreateSession.mock.calls[0][0];
    expect(body.exercises.items[0]).not.toHaveProperty('load');
  });

  it('édition : séance mixte (intervalle + bloc custom) → canvas composite par bloc (ADR-42)', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        id: 's-2',
        title: 'Piste',
        status: 'draft',
        coachId: 'c-1',
        exercises: {
          schemaVersion: 2,
          items: [
            { name: '5 × 200m', order: 1, type: 'interval', params: { reps: 5, workSeconds: 30 } },
            // Structure hétérogène (endurance reconnue + bloc custom) → composite (ADR-42 §4) :
            // segment Endurance (carte dédiée encart) + segment Personnalisé (éditeur générique).
            { name: 'Gainage libre', order: 2, type: 'custom' },
          ],
        },
      },
    });
    render(<SessionBuilderScreen sessionId="s-2" />, { wrapper: Wrapper });

    // Deux blocs : le 1er rendu par la carte Endurance en encart, le 2nd par l'éditeur générique.
    await waitFor(() => expect(screen.getByTestId('composite-bloc-0')).toBeOnTheScreen());
    expect(screen.getByTestId('composite-bloc-1')).toBeOnTheScreen();
    expect(screen.getByTestId('endurance-effort-canvas')).toBeOnTheScreen();
    expect(screen.getByTestId('session-add-block')).toBeOnTheScreen(); // segment Personnalisé
    expect(screen.queryByTestId('session-builder-mixed-banner')).toBeNull();
  });

  it('édition (ADR-40 §2) : séance pure haies → carte dédiée au lieu de l’éditeur générique', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        id: 's-hurdles',
        title: 'Haies',
        status: 'draft',
        coachId: 'c-1',
        exercises: {
          schemaVersion: 3,
          items: [
            {
              kind: 'group',
              name: 'Série haies',
              order: 1,
              groupType: 'series',
              rounds: 3,
              items: [
                { name: '10 haies', order: 1, type: 'hurdles', params: { distanceMeters: 110 } },
              ],
            },
          ],
        },
      },
    });
    render(<SessionBuilderScreen sessionId="s-hurdles" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('hurdles-effort-canvas')).toBeOnTheScreen());
    expect(screen.queryByText(/Blocs et groupes/)).toBeNull();
    expect(screen.queryByTestId('session-builder-mixed-banner')).toBeNull();
  });

  it('édition (ADR-42 §4) : séance mixte (sprint + haies) → canvas composite, deux blocs', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        id: 's-mixed',
        title: 'Mixte',
        status: 'draft',
        coachId: 'c-1',
        exercises: {
          schemaVersion: 3,
          items: [
            {
              kind: 'group',
              name: 'Série sprint',
              order: 1,
              groupType: 'series',
              rounds: 2,
              items: [{ name: '60m', order: 1, type: 'sprint', params: { distanceMeters: 60 } }],
            },
            {
              kind: 'group',
              name: 'Série haies',
              order: 2,
              groupType: 'series',
              rounds: 2,
              items: [
                { name: '10 haies', order: 2, type: 'hurdles', params: { distanceMeters: 110 } },
              ],
            },
          ],
        },
      },
    });
    render(<SessionBuilderScreen sessionId="s-mixed" />, { wrapper: Wrapper });

    // Mélange reconnu → composite bloc par bloc (ADR-42 §4) : un bloc Sprint, un bloc Haies, en
    // cartes encart — plus de bandeau « édition avancée ».
    await waitFor(() => expect(screen.getByTestId('composite-bloc-0')).toBeOnTheScreen());
    expect(screen.getByTestId('composite-bloc-1')).toBeOnTheScreen();
    expect(screen.getByTestId('sprint-effort-canvas')).toBeOnTheScreen();
    expect(screen.getByTestId('hurdles-effort-canvas')).toBeOnTheScreen();
    expect(screen.queryByTestId('session-builder-mixed-banner')).toBeNull();
  });

  it('édition (ADR-42 §4) : séance sans bloc reconnu (custom seul) → composite, segment Personnalisé', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        id: 's-custom',
        title: 'Libre',
        status: 'draft',
        coachId: 'c-1',
        exercises: {
          schemaVersion: 2,
          items: [{ name: 'Gainage', order: 1, type: 'custom' }],
        },
      },
    });
    render(<SessionBuilderScreen sessionId="s-custom" />, { wrapper: Wrapper });

    // Bloc non reconnu → segment Personnalisé (éditeur générique embarqué) dans un cadre de bloc.
    await waitFor(() => expect(screen.getByTestId('composite-bloc-0')).toBeOnTheScreen());
    expect(screen.getByText(/Blocs et groupes/)).toBeOnTheScreen();
    expect(screen.getByTestId('composite-add-bloc')).toBeOnTheScreen();
    expect(screen.queryByTestId('session-builder-mixed-banner')).toBeNull();
  });

  it('charge une séance existante puis la met à jour (PUT)', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        id: 's-1',
        title: 'Force max',
        status: 'published',
        coachId: 'c-1',
        exercises: {
          schemaVersion: 1,
          items: [{ name: 'Développé', order: 1, sets: 4, reps: 2 }],
        },
      },
    });
    mockUpdateSession.mockResolvedValue({ status: 200, data: { id: 's-1' } });
    render(<SessionBuilderScreen sessionId="s-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Modifier la séance'),
    );
    expect(screen.getByTestId('block-0-name').props.value).toBe('Développé');

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Force max v2');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalled());
    const [id, body] = mockUpdateSession.mock.calls[0];
    expect(id).toBe('s-1');
    expect(body.title).toBe('Force max v2');
    expect(body.exercises.items[0].name).toBe('Développé');
  });

  it('état erreur si la séance à éditer ne charge pas', async () => {
    mockGetSession.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<SessionBuilderScreen sessionId="s-x" />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('session-builder-error')).toBeOnTheScreen());
  });

  it('inclut le brief saisi (champs partagés + coach-only) dans la création (ADR-28)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-brief' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Intermittent VO₂max');
    fireEvent.changeText(screen.getByTestId('block-0-name'), '30/30');
    fireEvent.press(screen.getByTestId('brief-section-toggle'));
    fireEvent.changeText(screen.getByTestId('brief-field-athleteIntent'), 'Cours relâché.');
    fireEvent.changeText(screen.getByTestId('brief-field-difficulty'), '7');
    fireEvent.changeText(screen.getByTestId('brief-field-success'), 'Tenir les 16 efforts.');
    fireEvent.changeText(screen.getByTestId('brief-field-intent'), 'VO₂max — régularité.');
    fireEvent.changeText(screen.getByTestId('brief-field-regression'), '2 × 6 si décrochage.');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    expect(mockCreateSession.mock.calls[0][0].brief).toMatchObject({
      athleteIntent: 'Cours relâché.',
      difficulty: 7,
      successCriteria: 'Tenir les 16 efforts.',
      intent: 'VO₂max — régularité.',
      coachNotes: { regression: '2 × 6 si décrochage.' },
    });
  });

  it('séance sans brief : la création n’émet pas de brief (rétro-compat)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-nobrief' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Sans brief');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'A');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    expect(mockCreateSession.mock.calls[0][0].brief).toBeUndefined();
  });

  it('aperçu « Voir comme l’athlète » : lecture athlète sans les notes coach (ADR-28)', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('brief-section-toggle'));
    fireEvent.changeText(screen.getByTestId('brief-field-athleteIntent'), 'Consigne athlète.');
    fireEvent.changeText(screen.getByTestId('brief-field-intent'), 'Note interne secrète.');
    fireEvent.press(screen.getByTestId('brief-preview-toggle'));

    const preview = screen.getByTestId('brief-athlete-preview');
    expect(preview).toHaveTextContent(/Consigne athlète\./);
    expect(preview).not.toHaveTextContent(/Note interne secrète\./);
  });

  it('édition : hydrate le brief existant dans la section (ADR-28)', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        id: 's-b',
        title: 'Avec brief',
        status: 'published',
        coachId: 'c-1',
        exercises: { schemaVersion: 2, items: [{ name: 'A', order: 1 }] },
        brief: { difficulty: 8, athleteIntent: 'Relâché.', intent: 'Interne.' },
      },
    });
    render(<SessionBuilderScreen sessionId="s-b" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Modifier la séance'),
    );
    fireEvent.press(screen.getByTestId('brief-section-toggle'));
    expect(screen.getByTestId('brief-field-difficulty').props.value).toBe('8');
    expect(screen.getByTestId('brief-field-athleteIntent').props.value).toBe('Relâché.');
    expect(screen.getByTestId('brief-field-intent').props.value).toBe('Interne.');
  });

  // La création/sérialisation des GROUPES (ADR-27) et le déplacement de blocs dans/hors d'un
  // groupe sont couverts au niveau du composant `GenericBlocksEditor` (generic-blocks-editor.test).

  it('refuse un membre de groupe sans param de suivi (TLX-91 traversant)', () => {
    // Garde de suivi traversant les groupes (validation écran de `nodes`) : on amorce une série
    // de sprint sans distance via `seed` (le choix de type est couvert côté GenericBlocksEditor).
    render(
      <SessionBuilderScreen
        seed={() => [
          makeSeriesGroup({
            name: 'Série',
            items: [makeBlock({ type: BlockType.sprint, name: '8 × 60m' })],
          }),
        ]}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse');
    fireEvent.press(screen.getByTestId('session-save'));

    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(/distance/i);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // --- Mode modèle (C-10, ADR-29) ---

  it('mode modèle : chip Modèle → titre « Nouveau modèle », date masquée', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    // Par défaut (séance) : champ date présent.
    expect(screen.getByTestId('session-field-date')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('session-status-template'));
    expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Nouveau modèle');
    // Un modèle n'est pas daté → champ masqué.
    expect(screen.queryByTestId('session-field-date')).toBeNull();
  });

  it('crée un modèle (status template) puis revient à la bibliothèque, pas à l’assignation', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 't-new', status: 'template' } });
    render(
      <SessionBuilderScreen
        seed={() => [
          makeBlock({
            type: BlockType.sprint,
            name: 'Sprint',
            params: { distanceMeters: '60' },
          }),
        ]}
      />,
      { wrapper: Wrapper },
    );

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Séance type sprint');
    fireEvent.press(screen.getByTestId('session-status-template'));
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    expect(mockCreateSession.mock.calls[0][0].status).toBe('template');
    // Retour à la bibliothèque de modèles, jamais vers l'assignation (non assignable).
    expect(mockReplace).toHaveBeenCalledWith('/(coach)/templates');
    expect(mockReplace).not.toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(coach)/assign/[id]' }),
    );
  });

  it('initialStatus=template : ouvre directement en mode modèle', () => {
    render(<SessionBuilderScreen initialStatus="template" />, { wrapper: Wrapper });
    expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Nouveau modèle');
    expect(screen.queryByTestId('session-field-date')).toBeNull();
  });

  it('édition d’un modèle : titre dédié, sans bouton d’assignation (non assignable)', async () => {
    mockGetSession.mockResolvedValue({
      status: 200,
      data: {
        id: 't-1',
        title: 'Modèle sprint',
        status: 'template',
        coachId: 'c-1',
        exercises: { schemaVersion: 3, items: [{ name: 'Sprint', order: 1 }] },
      },
    });
    render(<SessionBuilderScreen sessionId="t-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('session-builder-title')).toHaveTextContent('Modifier le modèle'),
    );
    // Un modèle ne s'assigne pas → pas de bouton d'assignation.
    expect(screen.queryByTestId('session-assign')).toBeNull();
    expect(screen.queryByTestId('session-field-date')).toBeNull();
  });

  // Le déplacement d'un bloc dans/hors d'un groupe voisin est couvert au niveau du composant
  // `GenericBlocksEditor` (generic-blocks-editor.test.tsx).
});
