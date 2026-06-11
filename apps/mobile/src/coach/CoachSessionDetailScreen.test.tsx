import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetSession = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getSession: (...a: unknown[]) => mockGetSession(...a),
  SessionStatus: { draft: 'draft', published: 'published', archived: 'archived' },
  CompetitionStatus: { draft: 'draft', published: 'published', archived: 'archived' },
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
  BlockType: { strength: 'strength', sprint: 'sprint', warmup: 'warmup', custom: 'custom' },
  LoadUnit: { kg: 'kg', lb: 'lb', percent_1rm: 'percent_1rm', bodyweight: 'bodyweight' },
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({ id: 's-1' }),
}));

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

beforeEach(() => jest.clearAllMocks());

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
    expect(screen.getByTestId('exercise-1')).toHaveTextContent(/A1 · Squat/);
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
});
