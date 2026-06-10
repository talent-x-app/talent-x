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
  SessionStatus: { draft: 'draft', published: 'published', archived: 'archived' },
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

  it('refuse un bloc chronométré sans le param de suivi (distance) (TLX-91)', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse');
    fireEvent.changeText(screen.getByTestId('block-0-name'), '8 × 60m');
    fireEvent.press(screen.getByTestId('block-0-type-sprint'));
    // Distance laissée vide → la perf serait invisible en progression : on bloque.
    fireEvent.press(screen.getByTestId('session-save'));
    expect(screen.getByTestId('session-builder-validation')).toHaveTextContent(/distance/i);
    expect(mockCreateSession).not.toHaveBeenCalled();

    // Une fois la distance renseignée, l'enregistrement passe.
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-ok' } });
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '60');
    fireEvent.press(screen.getByTestId('session-save'));
    return waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
  });

  it('ajoute et supprime des blocs', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('session-add-block'));
    expect(screen.getByTestId('block-1')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('block-1-remove'));
    expect(screen.queryByTestId('block-1')).toBeNull();
  });

  it('masque le champ de base redondant sur un bloc typé (TLX-94)', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    // Bloc custom : la base « Répétitions » est présente.
    expect(screen.getByTestId('block-0-reps')).toBeOnTheScreen();
    expect(screen.getByTestId('block-0-sets')).toBeOnTheScreen();

    // Sprints : la base « Répétitions » disparaît (le param « nombre de sprints » la couvre),
    // mais « Séries » (non dupliquée) et le param restent.
    fireEvent.press(screen.getByTestId('block-0-type-sprint'));
    expect(screen.queryByTestId('block-0-reps')).toBeNull();
    expect(screen.getByTestId('block-0-sets')).toBeOnTheScreen();
    expect(screen.getByTestId('block-0-param-reps')).toBeOnTheScreen();
  });

  it('ne sérialise pas un champ de base masqué — pas de fuite (TLX-94)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-leak' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse');
    fireEvent.changeText(screen.getByTestId('block-0-name'), '8 × 60m');
    // Saisie d'une valeur sur la base v1 (bloc custom) PUIS bascule en Sprints : la base
    // « Répétitions » devient masquée — sa valeur résiduelle ne doit pas être sérialisée.
    fireEvent.changeText(screen.getByTestId('block-0-reps'), '99');
    fireEvent.press(screen.getByTestId('block-0-type-sprint'));
    fireEvent.changeText(screen.getByTestId('block-0-param-reps'), '8');
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '60');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).not.toHaveProperty('reps');
    expect(item.params).toMatchObject({ reps: 8, distanceMeters: 60 });
  });

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
        schemaVersion: 2,
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

  it('bloc custom par défaut : pas de section params', () => {
    render(<SessionBuilderScreen />, { wrapper: Wrapper });
    expect(screen.queryByTestId('block-0-params')).toBeNull();
  });

  it('sélectionne Intervalles → affiche les params et sérialise type + params (TLX-053/054)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-int' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Fractionné');
    fireEvent.changeText(screen.getByTestId('block-0-name'), '6 × 400m');
    fireEvent.press(screen.getByTestId('block-0-type-interval'));

    // L'éditeur de params propre à « Intervalles » apparaît.
    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-reps'), '6');
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '400');
    fireEvent.changeText(screen.getByTestId('block-0-param-workSeconds'), '90');
    fireEvent.changeText(screen.getByTestId('block-0-param-recoverySeconds'), '120');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: '6 × 400m',
      order: 1,
      type: 'interval',
      params: { reps: 6, distanceMeters: 400, workSeconds: 90, recoverySeconds: 120 },
    });
  });

  it('sélectionne Hauteur/Perche → sélecteur discipline + params, sérialise (TLX-075/ADR-25)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-vj' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Sauts');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Hauteur');
    fireEvent.press(screen.getByTestId('block-0-type-vertical_jumps'));

    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    // Le champ discipline est un sélecteur (chips), pas une saisie numérique.
    fireEvent.press(screen.getByTestId('block-0-param-discipline-pole'));
    fireEvent.changeText(screen.getByTestId('block-0-param-startHeightCm'), '420');
    fireEvent.changeText(screen.getByTestId('block-0-param-incrementCm'), '15');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: 'Hauteur',
      order: 1,
      type: 'vertical_jumps',
      params: { discipline: 'pole', startHeightCm: 420, incrementCm: 15 },
    });
  });

  it('sélectionne Sprints → sérialise type + params (distance, reps, récup) (TLX-055)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-spr' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Vitesse');
    fireEvent.changeText(screen.getByTestId('block-0-name'), '8 × 60m départ');
    fireEvent.press(screen.getByTestId('block-0-type-sprint'));

    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-reps'), '8');
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '60');
    fireEvent.changeText(screen.getByTestId('block-0-param-recoverySeconds'), '180');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: '8 × 60m départ',
      order: 1,
      type: 'sprint',
      params: { reps: 8, distanceMeters: 60, recoverySeconds: 180 },
    });
  });

  it('sélectionne Course → sérialise type + params (distance, allure, dénivelé) (TLX-056)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-end' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Tempo');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Tempo 5 km');
    fireEvent.press(screen.getByTestId('block-0-type-endurance'));

    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '5000');
    fireEvent.changeText(screen.getByTestId('block-0-param-paceSecondsPerKm'), '300');
    fireEvent.changeText(screen.getByTestId('block-0-param-elevationMeters'), '120');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: 'Tempo 5 km',
      order: 1,
      type: 'endurance',
      params: { distanceMeters: 5000, paceSecondsPerKm: 300, elevationMeters: 120 },
    });
  });

  it('sélectionne Haies → sérialise type + params (hauteur décimale, espacement, rythme) (TLX-057)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-hur' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Haies');
    fireEvent.changeText(screen.getByTestId('block-0-name'), '5 haies rythme 3');
    fireEvent.press(screen.getByTestId('block-0-type-hurdles'));

    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-distanceMeters'), '110');
    fireEvent.changeText(screen.getByTestId('block-0-param-heightCm'), '84');
    fireEvent.changeText(screen.getByTestId('block-0-param-spacingMeters'), '8.5');
    fireEvent.changeText(screen.getByTestId('block-0-param-rhythmSteps'), '3');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: '5 haies rythme 3',
      order: 1,
      type: 'hurdles',
      params: { distanceMeters: 110, heightCm: 84, spacingMeters: 8.5, rhythmSteps: 3 },
    });
  });

  it('sélectionne Sauts → sérialise type + params (élan décimal, complets, pliométrie) (TLX-058)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-jmp' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Sauts');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Longueur — élan complet');
    fireEvent.press(screen.getByTestId('block-0-type-jumps'));

    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-approachMeters'), '30.5');
    fireEvent.changeText(screen.getByTestId('block-0-param-fullJumps'), '6');
    fireEvent.changeText(screen.getByTestId('block-0-param-plyoContacts'), '40');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: 'Longueur — élan complet',
      order: 1,
      type: 'jumps',
      params: { approachMeters: 30.5, fullJumps: 6, plyoContacts: 40 },
    });
  });

  it('sélectionne Lancers → sérialise type + params (engin kg, technique/complets) (TLX-059)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-thr' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Poids');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Poids 7.26 kg');
    fireEvent.press(screen.getByTestId('block-0-type-throws'));

    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-implementKg'), '7.26');
    fireEvent.changeText(screen.getByTestId('block-0-param-techniqueThrows'), '10');
    fireEvent.changeText(screen.getByTestId('block-0-param-fullThrows'), '6');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: 'Poids 7.26 kg',
      order: 1,
      type: 'throws',
      params: { implementKg: 7.26, techniqueThrows: 10, fullThrows: 6 },
    });
  });

  it('sélectionne Musculation → type strength sur la base v1, sans section params (TLX-060)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-str' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Force');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Développé couché');
    fireEvent.press(screen.getByTestId('block-0-type-strength'));
    fireEvent.changeText(screen.getByTestId('block-0-sets'), '4');
    fireEvent.changeText(screen.getByTestId('block-0-reps'), '6');
    fireEvent.changeText(screen.getByTestId('block-0-load'), '90');
    fireEvent.press(screen.getByTestId('block-0-unit-kg'));

    // Musculation = base v1 générique : aucune section params.
    expect(screen.queryByTestId('block-0-params')).toBeNull();
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: 'Développé couché',
      order: 1,
      type: 'strength',
      sets: 4,
      reps: 6,
      load: { value: 90, unit: 'kg' },
    });
    expect(item).not.toHaveProperty('params');
  });

  it('sélectionne Gainage / Circuit → sérialise type + params partagés (tours, station) (TLX-061)', async () => {
    mockCreateSession.mockResolvedValue({ status: 201, data: { id: 's-core' } });
    render(<SessionBuilderScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('session-field-title'), 'Renfo');
    fireEvent.changeText(screen.getByTestId('block-0-name'), 'Circuit gainage');
    fireEvent.press(screen.getByTestId('block-0-type-core'));

    expect(screen.getByTestId('block-0-params')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByTestId('block-0-param-rounds'), '3');
    fireEvent.changeText(screen.getByTestId('block-0-param-stationSeconds'), '45');
    fireEvent.press(screen.getByTestId('session-save'));

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());
    const item = mockCreateSession.mock.calls[0][0].exercises.items[0];
    expect(item).toMatchObject({
      name: 'Circuit gainage',
      order: 1,
      type: 'core',
      params: { rounds: 3, stationSeconds: 45 },
    });
  });

  it('édition : hydrate type et params d’un bloc intervalle', async () => {
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
          ],
        },
      },
    });
    render(<SessionBuilderScreen sessionId="s-2" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('block-0-params')).toBeOnTheScreen());
    expect(screen.getByTestId('block-0-param-reps').props.value).toBe('5');
    expect(screen.getByTestId('block-0-param-workSeconds').props.value).toBe('30');
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
});
