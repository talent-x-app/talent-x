import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockLogTrainingSession = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  logTrainingSession: (...a: unknown[]) => mockLogTrainingSession(...a),
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { FreeSessionLog } from './FreeSessionLog';

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

describe('FreeSessionLog (TLX-111 — A, ADR-36)', () => {
  it('replié : un bouton « Enregistrer une séance libre » ouvre le formulaire', () => {
    render(<FreeSessionLog />, { wrapper: Wrapper });
    expect(screen.getByTestId('free-session-open')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('free-session-open'));
    expect(screen.getByTestId('free-session-form')).toBeOnTheScreen();
  });

  it('construit un bloc typé + résultat mesuré et poste la séance libre (épreuve chronométrée)', async () => {
    mockLogTrainingSession.mockResolvedValue({ status: 201, data: { id: 'perf-1' } });
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));

    fireEvent.changeText(screen.getByTestId('free-session-title'), 'Footing 8 km');
    fireEvent.changeText(screen.getByTestId('free-session-date'), '2026-06-10');
    // Famille « endurance » (chronométrée) + distance + temps.
    fireEvent.press(screen.getByTestId('free-family-endurance'));
    fireEvent.changeText(screen.getByTestId('free-distance'), '5000');
    fireEvent.changeText(screen.getByTestId('free-mark'), '1500');
    fireEvent.changeText(screen.getByTestId('free-rpe'), '5');

    fireEvent.press(screen.getByTestId('free-submit'));

    await waitFor(() => expect(mockLogTrainingSession).toHaveBeenCalledTimes(1));
    const body = mockLogTrainingSession.mock.calls[0][0];
    expect(body).toMatchObject({
      title: 'Footing 8 km',
      date: '2026-06-10',
      rpe: 5,
    });
    // Document `exercises` étiqueté à la version courante du contrat (v3, ADR-27).
    expect(body.exercises.schemaVersion).toBe(3);
    expect(body.exercises.items[0]).toMatchObject({
      name: 'Footing 8 km',
      order: 0,
      type: 'endurance',
      params: { distanceMeters: 5000 },
    });
    expect(body.results.items[0].setResults[0]).toMatchObject({
      set: 1,
      timeSeconds: 1500,
      completed: true,
    });
    // Succès → toast + repli du formulaire.
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    );
    await waitFor(() => expect(screen.queryByTestId('free-session-form')).toBeNull());
  });

  it('épreuve de distance (saut) : la marque va dans distanceMeters', async () => {
    mockLogTrainingSession.mockResolvedValue({ status: 201, data: { id: 'perf-2' } });
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));

    fireEvent.changeText(screen.getByTestId('free-session-date'), '2026-06-11');
    fireEvent.press(screen.getByTestId('free-family-jumps'));
    fireEvent.changeText(screen.getByTestId('free-mark'), '6.42');
    fireEvent.press(screen.getByTestId('free-submit'));

    await waitFor(() => expect(mockLogTrainingSession).toHaveBeenCalledTimes(1));
    const body = mockLogTrainingSession.mock.calls[0][0];
    expect(body.exercises.items[0]).toMatchObject({ type: 'jumps', params: {} });
    expect(body.results.items[0].setResults[0]).toMatchObject({ distanceMeters: 6.42 });
  });

  it('soumission désactivée tant que date / marque manquent', () => {
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));
    // Rien rempli → bouton désactivé (pas d'appel API au press).
    fireEvent.press(screen.getByTestId('free-submit'));
    expect(mockLogTrainingSession).not.toHaveBeenCalled();
  });
});

describe('FreeSessionLog — exemples dérivés de la famille (TLX-247)', () => {
  /** Le placeholder est la seule chose qui désambiguïse l'unité au moment de la frappe. */
  const placeholderOf = (testID: string) => screen.getByTestId(testID).props.placeholder;

  it('sprint : l’exemple de temps est un temps de sprint, pas « 1500 »', () => {
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));

    // Défaut = sprint. « 1500 » à côté d'une pastille Sprint se lit comme 1500 **m**.
    expect(placeholderOf('free-mark')).toBe('Temps (s) — ex. 7.42');
    expect(placeholderOf('free-mark')).not.toContain('1500');
    expect(placeholderOf('free-distance')).toBe('Distance (m) — ex. 60');
  });

  it('endurance : l’exemple de temps redevient « 1500 », qui y est plausible', () => {
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));
    fireEvent.press(screen.getByTestId('free-family-endurance'));

    // 1500 s ≈ 25 min : correct ici, et c'est bien la famille qui décide.
    expect(placeholderOf('free-mark')).toBe('Temps (s) — ex. 1500');
    expect(placeholderOf('free-distance')).toBe('Distance (m) — ex. 5000');
  });

  it('saut : unité en mètres, exemple de marque en mètres', () => {
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));
    fireEvent.press(screen.getByTestId('free-family-jumps'));

    expect(placeholderOf('free-mark')).toBe('Marque (m) — ex. 6.42');
    // Famille sans paramètre : pas de champ distance à désambiguïser.
    expect(screen.queryByTestId('free-distance')).toBeNull();
  });

  it('chaque famille porte un exemple distinct de celui du sprint', () => {
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));

    const marks = new Set<string>();
    for (const family of ['sprint', 'hurdles', 'endurance', 'interval', 'jumps', 'vertical']) {
      fireEvent.press(screen.getByTestId(`free-family-${family}`));
      marks.add(placeholderOf('free-mark'));
    }
    // Six familles, six exemples : aucun n'est partagé par défaut d'unité.
    expect(marks.size).toBe(6);
  });
});

describe('FreeSessionLog — mode multi-séries (TLX-162, ADR-38)', () => {
  it('bascule multi-séries : 3 séries par défaut, le Stepper en ajoute en préservant la saisie', () => {
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));

    fireEvent.press(screen.getByTestId('free-mode-multi'));
    expect(screen.getByTestId('free-series-mark-1')).toBeOnTheScreen();
    expect(screen.getByTestId('free-series-mark-3')).toBeOnTheScreen();
    expect(screen.queryByTestId('free-mark')).toBeNull();

    fireEvent.changeText(screen.getByTestId('free-series-mark-1'), '7.42');
    fireEvent.press(screen.getByTestId('free-series-count-inc'));
    expect(screen.getByTestId('free-series-mark-4')).toBeOnTheScreen();
    // La marque déjà saisie survit au redimensionnement.
    expect(screen.getByTestId('free-series-mark-1').props.value).toBe('7.42');
  });

  it('sérialise « N × D » : params.reps + une marque par série dans setResults', async () => {
    mockLogTrainingSession.mockResolvedValue({ status: 201, data: { id: 'perf-3' } });
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));

    fireEvent.changeText(screen.getByTestId('free-session-date'), '2026-07-01');
    fireEvent.changeText(screen.getByTestId('free-distance'), '60');
    fireEvent.press(screen.getByTestId('free-mode-multi'));
    fireEvent.changeText(screen.getByTestId('free-series-mark-1'), '7.42');
    fireEvent.changeText(screen.getByTestId('free-series-mark-2'), '7.38');
    fireEvent.changeText(screen.getByTestId('free-series-mark-3'), '7.51');
    fireEvent.press(screen.getByTestId('free-submit'));

    await waitFor(() => expect(mockLogTrainingSession).toHaveBeenCalledTimes(1));
    const body = mockLogTrainingSession.mock.calls[0][0];
    // Grammaire assistants (ADR-38/52) : 3 × 60 m — reps porté par params.
    expect(body.exercises.items[0]).toMatchObject({
      type: 'sprint',
      params: { distanceMeters: 60, reps: 3 },
    });
    expect(body.results.items[0].setResults).toEqual([
      { set: 1, timeSeconds: 7.42, completed: true },
      { set: 2, timeSeconds: 7.38, completed: true },
      { set: 3, timeSeconds: 7.51, completed: true },
    ]);
  });

  it('multi-séries : soumission bloquée tant que chaque série n’a pas sa marque', () => {
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));

    fireEvent.changeText(screen.getByTestId('free-session-date'), '2026-07-01');
    fireEvent.changeText(screen.getByTestId('free-distance'), '60');
    fireEvent.press(screen.getByTestId('free-mode-multi'));
    fireEvent.changeText(screen.getByTestId('free-series-mark-1'), '7.42');
    // Séries 2 et 3 vides → pas d'appel API.
    fireEvent.press(screen.getByTestId('free-submit'));
    expect(mockLogTrainingSession).not.toHaveBeenCalled();
  });

  it('revenir au mode simple ne régresse pas la saisie une-marque', async () => {
    mockLogTrainingSession.mockResolvedValue({ status: 201, data: { id: 'perf-4' } });
    render(<FreeSessionLog />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('free-session-open'));

    fireEvent.changeText(screen.getByTestId('free-session-date'), '2026-07-02');
    fireEvent.press(screen.getByTestId('free-mode-multi'));
    fireEvent.press(screen.getByTestId('free-mode-simple'));
    fireEvent.press(screen.getByTestId('free-family-jumps'));
    fireEvent.changeText(screen.getByTestId('free-mark'), '6.10');
    fireEvent.press(screen.getByTestId('free-submit'));

    await waitFor(() => expect(mockLogTrainingSession).toHaveBeenCalledTimes(1));
    const body = mockLogTrainingSession.mock.calls[0][0];
    // Pas de reps en mode simple ; une seule marque.
    expect(body.exercises.items[0].params).toEqual({});
    expect(body.results.items[0].setResults).toHaveLength(1);
  });
});
