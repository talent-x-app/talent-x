import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListSessions = jest.fn();
const mockListAssignments = jest.fn();
const mockListCompetitions = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listSessions: (...a: unknown[]) => mockListSessions(...a),
  listAssignments: (...a: unknown[]) => mockListAssignments(...a),
  listCompetitions: (...a: unknown[]) => mockListCompetitions(...a),
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

import { CoachSessionsTabsScreen } from './CoachSessionsTabsScreen';

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

const EMPTY = { status: 200 as const, data: { data: [], meta: {} } };

beforeEach(() => {
  jest.clearAllMocks();
  mockListSessions.mockResolvedValue(EMPTY);
  mockListAssignments.mockResolvedValue(EMPTY);
  mockListCompetitions.mockResolvedValue(EMPTY);
});

describe('CoachSessionsTabsScreen (ADR-53 — hub Liste ⇄ Calendrier)', () => {
  it('rend l’en-tête, la bascule et le bouton « Nouvelle séance »', () => {
    render(<CoachSessionsTabsScreen />, { wrapper: Wrapper });
    expect(screen.getByText('Séances')).toBeOnTheScreen();
    expect(screen.getByTestId('coach-sessions-view-tabs')).toBeOnTheScreen();
    fireEvent.press(screen.getByTestId('coach-sessions-new'));
    expect(mockPush).toHaveBeenCalledWith('/(coach)/session/new');
  });

  it('bascule sur Calendrier → rend le calendrier embarqué', async () => {
    render(<CoachSessionsTabsScreen />, { wrapper: Wrapper });
    fireEvent.press(screen.getByTestId('coach-sessions-view-tabs-calendar'));
    await waitFor(() => expect(screen.getByTestId('calendar-competitions-link')).toBeOnTheScreen());
  });
});
