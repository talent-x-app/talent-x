import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockLogTrainingSession = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  logTrainingSession: (...a: unknown[]) => mockLogTrainingSession(...a),
  // Le mode détaillé (TLX-162) tire les canvas d'effort coach → imports valeur BlockType/LoadUnit.
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

  describe('mode assistant détaillé (TLX-162, ADR-38)', () => {
    it('bascule vers le canvas multi-séries : marque masquée, canvas sprint amorcé', () => {
      render(<FreeSessionLog />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('free-session-open'));
      fireEvent.press(screen.getByTestId('free-mode-detailed'));

      expect(screen.getByTestId('free-detailed-canvas')).toBeOnTheScreen();
      expect(screen.getByTestId('sprint-effort-canvas')).toBeOnTheScreen();
      // Champs du mode rapide masqués (marque / famille).
      expect(screen.queryByTestId('free-mark')).toBeNull();
      expect(screen.queryByTestId('free-family-endurance')).toBeNull();
    });

    it('changer de discipline ré-amorce le canvas correspondant', () => {
      render(<FreeSessionLog />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('free-session-open'));
      fireEvent.press(screen.getByTestId('free-mode-detailed'));
      fireEvent.press(screen.getByTestId('free-canvas-strength'));
      expect(screen.getByTestId('strength-effort-canvas')).toBeOnTheScreen();
      expect(screen.queryByTestId('sprint-effort-canvas')).toBeNull();
    });

    it('poste une séance multi-séries : exercises v3 (groupe) + feuilles réalisées (ADR-36)', async () => {
      mockLogTrainingSession.mockResolvedValue({ status: 201, data: { id: 'perf-1' } });
      render(<FreeSessionLog />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('free-session-open'));
      fireEvent.changeText(screen.getByTestId('free-session-title'), 'Sprint du soir');
      fireEvent.changeText(screen.getByTestId('free-session-date'), '2026-07-07');
      fireEvent.press(screen.getByTestId('free-mode-detailed'));

      fireEvent.press(screen.getByTestId('free-submit'));
      await waitFor(() => expect(mockLogTrainingSession).toHaveBeenCalledTimes(1));
      const body = mockLogTrainingSession.mock.calls[0][0];
      expect(body).toMatchObject({ title: 'Sprint du soir', date: '2026-07-07' });
      // Doc v3 : le seed sprint porte au moins un groupe de série.
      expect(body.exercises.schemaVersion).toBe(3);
      const hasGroup = body.exercises.items.some(
        (i: { items?: unknown[] }) => Array.isArray(i.items) && i.items.length > 0,
      );
      expect(hasGroup).toBe(true);
      // Résultats requis par le contrat : chaque feuille marquée réalisée.
      expect(body.results.schemaVersion).toBe(2);
      expect(body.results.items.length).toBeGreaterThan(0);
      for (const item of body.results.items) {
        expect(item.setResults).toEqual([{ set: 1, completed: true }]);
      }
    });

    it('soumission désactivée sans date en mode détaillé', () => {
      render(<FreeSessionLog />, { wrapper: Wrapper });
      fireEvent.press(screen.getByTestId('free-session-open'));
      fireEvent.press(screen.getByTestId('free-mode-detailed'));
      fireEvent.press(screen.getByTestId('free-submit'));
      expect(mockLogTrainingSession).not.toHaveBeenCalled();
    });
  });
});
