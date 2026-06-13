import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetAssignment = jest.fn();
const mockGetPerformance = jest.fn();
const mockSubmitPerformance = jest.fn();
const mockUpdatePerformance = jest.fn();
const mockListComments = jest.fn();
const mockShow = jest.fn();
let mockOnline = true;

jest.mock('@talent-x/api-client', () => ({
  getAssignment: (...a: unknown[]) => mockGetAssignment(...a),
  getPerformance: (...a: unknown[]) => mockGetPerformance(...a),
  submitPerformance: (...a: unknown[]) => mockSubmitPerformance(...a),
  updatePerformance: (...a: unknown[]) => mockUpdatePerformance(...a),
  listComments: (...a: unknown[]) => mockListComments(...a),
  createComment: jest.fn(),
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
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'as-1' }),
}));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  useNetworkStatus: () => mockOnline,
}));
// Trousseau en mémoire — la file/brouillon transitent par le vrai module `../offline`.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});

import * as SecureStore from 'expo-secure-store';
import { deviceStore, loadOutbox, saveDraft } from '../offline';
import { SessionDetailScreen } from './SessionDetailScreen';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

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
  store.clear();
  mockOnline = true;
  mockListComments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
  mockGetAssignment.mockResolvedValue({ status: 200, data: ASSIGNMENT });
  mockGetPerformance.mockResolvedValue({ status: 404, data: { error: 'NOT_FOUND' } });
});

describe('SessionDetailScreen — hors-ligne & brouillon (TLX-077)', () => {
  it('saisie hors ligne : met en file (sans appel réseau), notifie, affiche la bannière d’attente', async () => {
    mockOnline = false;
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    fireEvent.press(await screen.findByTestId('start-perf-entry'));
    // Bouton de soumission étiqueté hors-ligne.
    expect(screen.getByTestId('submit-performance')).toHaveTextContent('Enregistrer (hors ligne)');
    fireEvent.press(screen.getByTestId('exercise-0')); // coche un exercice
    fireEvent.press(screen.getByTestId('submit-performance'));

    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Enregistré hors ligne', variant: 'success' }),
      ),
    );
    // Aucune requête réseau ; l'écriture est en file.
    expect(mockSubmitPerformance).not.toHaveBeenCalled();
    expect(await loadOutbox(deviceStore)).toHaveLength(1);
    // Retour en lecture avec bannière « en attente de synchronisation ».
    expect(await screen.findByTestId('session-detail-pending-sync')).toBeOnTheScreen();
  });

  it('repli sur la file si l’envoi échoue sur panne réseau (en ligne mais fetch rejeté)', async () => {
    mockSubmitPerformance.mockRejectedValue(new TypeError('Network request failed'));
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    fireEvent.press(await screen.findByTestId('start-perf-entry'));
    fireEvent.press(screen.getByTestId('exercise-0'));
    fireEvent.press(screen.getByTestId('submit-performance'));

    await waitFor(() => expect(mockSubmitPerformance).toHaveBeenCalled());
    await waitFor(async () => expect(await loadOutbox(deviceStore)).toHaveLength(1));
    expect(mockShow).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Enregistré hors ligne', variant: 'success' }),
    );
  });

  it('restaure un brouillon local à l’entrée en saisie', async () => {
    await saveDraft(deviceStore, 'as-1', {
      entries: [
        { mode: 'checklist', done: [true] },
        { mode: 'checklist', done: [false] },
      ],
      rpe: 9,
      notes: 'reprise après blessure',
      savedAt: '2026-06-13T09:00:00.000Z',
    });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    fireEvent.press(await screen.findByTestId('start-perf-entry'));

    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Brouillon restauré', variant: 'info' }),
      ),
    );
    expect(screen.getByTestId('rpe-value')).toHaveTextContent('9/10');
    expect(screen.getByTestId('notes-input').props.value).toBe('reprise après blessure');
  });

  it('ne restaure pas un brouillon désaligné de la séance (garde-fou)', async () => {
    await saveDraft(deviceStore, 'as-1', {
      entries: [{ mode: 'checklist', done: [true] }], // 1 entrée alors que la séance en a 2
      rpe: 9,
      notes: 'obsolète',
      savedAt: '2026-06-13T09:00:00.000Z',
    });
    render(<SessionDetailScreen />, { wrapper: Wrapper });

    fireEvent.press(await screen.findByTestId('start-perf-entry'));
    await waitFor(() => expect(screen.getByTestId('rpe-value')).toBeOnTheScreen());
    expect(mockShow).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Brouillon restauré' }),
    );
    expect(screen.getByTestId('rpe-value')).toHaveTextContent('7/10'); // RPE par défaut
  });
});
