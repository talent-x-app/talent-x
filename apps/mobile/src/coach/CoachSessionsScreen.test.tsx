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
});
