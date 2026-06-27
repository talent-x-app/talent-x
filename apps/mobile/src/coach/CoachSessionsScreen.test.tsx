import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListSessions = jest.fn();
const mockListAssignments = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listSessions: (...a: unknown[]) => mockListSessions(...a),
  listAssignments: (...a: unknown[]) => mockListAssignments(...a),
  SessionStatus: {
    draft: 'draft',
    published: 'published',
    archived: 'archived',
    template: 'template',
    self_logged: 'self_logged',
  },
  CompetitionStatus: { draft: 'draft', published: 'published', cancelled: 'cancelled' },
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { CoachSessionsScreen } from './CoachSessionsScreen';

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

// Dates volontairement loin du présent → filtres À venir / Passées stables quelle que soit la date.
const SESSIONS = [
  {
    id: 's-future',
    title: 'À venir',
    status: 'published',
    coachId: 'me',
    scheduledDate: '2030-01-01',
    exercises: { items: [] },
  },
  {
    id: 's-past',
    title: 'Passée',
    status: 'published',
    coachId: 'me',
    scheduledDate: '2020-01-01',
    exercises: { items: [] },
  },
  { id: 's-draft', title: 'Brouillon', status: 'draft', coachId: 'me', exercises: { items: [] } },
  { id: 't-1', title: 'Modèle', status: 'template', coachId: 'me', exercises: { items: [] } },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockListSessions.mockResolvedValue({ status: 200, data: { data: SESSIONS, meta: {} } });
  mockListAssignments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
});

describe('CoachSessionsScreen (ADR-53 — liste 4 filtres)', () => {
  it('À venir par défaut : séance à venir visible, pas la passée', async () => {
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-session-row-s-future')).toBeOnTheScreen());
    expect(screen.queryByTestId('coach-session-row-s-past')).toBeNull();
  });

  it('filtre Passées → la séance passée', async () => {
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-sessions-filter-past')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('coach-sessions-filter-past'));
    expect(screen.getByTestId('coach-session-row-s-past')).toBeOnTheScreen();
    expect(screen.queryByTestId('coach-session-row-s-future')).toBeNull();
  });

  it('filtre Brouillons → le brouillon', async () => {
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('coach-sessions-filter-drafts')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId('coach-sessions-filter-drafts'));
    expect(screen.getByTestId('coach-session-row-s-draft')).toBeOnTheScreen();
  });

  it('filtre Modèles → le modèle + « Nouveau modèle »', async () => {
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('coach-sessions-filter-templates')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId('coach-sessions-filter-templates'));
    expect(screen.getByTestId('coach-session-row-t-1')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-sessions-new-template')).toBeOnTheScreen();
  });

  it('tap sur une séance ouvre son détail', async () => {
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-session-row-s-future')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('coach-session-row-s-future'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/session/[id]',
        params: expect.objectContaining({ id: 's-future' }),
      }),
    );
  });

  // --- Lot 2 (TLX-207) ---

  it('compteurs sur les onglets', async () => {
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByText('À venir 1')).toBeOnTheScreen());
    expect(screen.getByText('Passées 1')).toBeOnTheScreen();
    expect(screen.getByText('Brouillons 1')).toBeOnTheScreen();
    expect(screen.getByText('Modèles 1')).toBeOnTheScreen();
  });

  it('« assigné à N » sur la ligne (depuis les affectations)', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          { id: 'a1', sessionId: 's-future', athleteId: 'ath-1', status: 'assigned' },
          { id: 'a2', sessionId: 's-future', athleteId: 'ath-2', status: 'assigned' },
        ],
        meta: {},
      },
    });
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-session-row-s-future')).toBeOnTheScreen());
    expect(screen.getByText(/2 athlètes/)).toBeOnTheScreen();
  });

  it('recherche par titre filtre les lignes', async () => {
    mockListSessions.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 's-a',
            title: 'Sprint mardi',
            status: 'published',
            coachId: 'me',
            scheduledDate: '2030-01-01',
            exercises: { items: [] },
          },
          {
            id: 's-b',
            title: 'Endurance jeudi',
            status: 'published',
            coachId: 'me',
            scheduledDate: '2030-01-02',
            exercises: { items: [] },
          },
        ],
        meta: {},
      },
    });
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('coach-session-row-s-a')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('coach-sessions-search'), 'endurance');
    expect(screen.queryByTestId('coach-session-row-s-a')).toBeNull();
    expect(screen.getByTestId('coach-session-row-s-b')).toBeOnTheScreen();
  });

  it('filtre discipline (≥ 2 disciplines présentes)', async () => {
    mockListSessions.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 's-sprint',
            title: 'Vitesse',
            status: 'published',
            coachId: 'me',
            scheduledDate: '2030-01-01',
            exercises: { items: [{ name: '60m', order: 1, type: 'sprint' }] },
          },
          {
            id: 's-endu',
            title: 'Footing',
            status: 'published',
            coachId: 'me',
            scheduledDate: '2030-01-02',
            exercises: { items: [{ name: '5km', order: 1, type: 'endurance' }] },
          },
        ],
        meta: {},
      },
    });
    render(<CoachSessionsScreen />, { wrapper: Wrapper });
    await waitFor(() =>
      expect(screen.getByTestId('coach-sessions-discipline-sprint')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId('coach-sessions-discipline-sprint'));
    expect(screen.getByTestId('coach-session-row-s-sprint')).toBeOnTheScreen();
    expect(screen.queryByTestId('coach-session-row-s-endu')).toBeNull();
  });
});
