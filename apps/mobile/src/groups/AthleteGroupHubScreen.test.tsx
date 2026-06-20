import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMyGroups = jest.fn();
const mockListAssignments = jest.fn();
const mockGetGroupTeammates = jest.fn();
const mockLeaveGroup = jest.fn();
const mockListNotifications = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return {
    ...actual,
    getMyGroups: (...a: unknown[]) => mockGetMyGroups(...a),
    listAssignments: (...a: unknown[]) => mockListAssignments(...a),
    getGroupTeammates: (...a: unknown[]) => mockGetGroupTeammates(...a),
    leaveGroup: (...a: unknown[]) => mockLeaveGroup(...a),
    listNotifications: (...a: unknown[]) => mockListNotifications(...a),
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow }),
  toUserMessage: () => ({ title: 'Erreur', description: '' }),
}));
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ role: 'athlete', isLoading: false, signIn: jest.fn(), signOut: jest.fn() }),
}));

import { AthleteGroupHubScreen } from './AthleteGroupHubScreen';

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

const NOW = new Date(2026, 5, 21);

const GROUPS = {
  status: 200,
  data: {
    data: [
      {
        id: 'g-1',
        name: 'Sprint Élite',
        description: 'Groupe de sprint',
        memberCount: 12,
        joinedAt: '2026-01-01',
        coach: { id: 'c', firstName: 'Mamadou', lastName: 'Diallo' },
      },
    ],
  },
};

function asg(id: string, dueDate: string, title: string, type = 'sprint') {
  return {
    id,
    sessionId: `s-${id}`,
    athleteId: 'a',
    status: 'assigned',
    dueDate,
    session: {
      id: `s-${id}`,
      title,
      status: 'published',
      coachId: 'c',
      exercises: { schemaVersion: 3, items: [{ name: 'x', type, order: 0 }] },
    },
  };
}

const ASSIGNMENTS = {
  status: 200,
  data: { data: [asg('today', '2026-06-21', 'Test 150 m'), asg('past', '2026-06-14', 'VMA')] },
};

beforeEach(() => {
  mockGetMyGroups.mockResolvedValue(GROUPS);
  mockListAssignments.mockResolvedValue(ASSIGNMENTS);
  mockGetGroupTeammates.mockResolvedValue({
    status: 200,
    data: { data: [{ id: 't-1', firstName: 'Awa', lastName: 'Traoré' }] },
  });
  mockLeaveGroup.mockResolvedValue({ status: 204 });
  mockListNotifications.mockResolvedValue({ status: 200, data: { data: [] } });
  mockPush.mockReset();
  mockBack.mockReset();
  mockShow.mockReset();
});

function renderHub() {
  return render(
    <Wrapper>
      <AthleteGroupHubScreen groupId="g-1" now={NOW} />
    </Wrapper>,
  );
}

describe('AthleteGroupHubScreen (ADR-43, TLX-173 Phase A)', () => {
  it('en-tête : nom du groupe + coach · N athlètes', async () => {
    renderHub();
    await waitFor(() =>
      expect(screen.getByTestId('athlete-group-name')).toHaveTextContent('Sprint Élite'),
    );
    expect(screen.getByText(/Coach Mamadou Diallo · 12 athlètes/)).toBeOnTheScreen();
  });

  it('onglet Séances par défaut : carte next-up', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('group-next-up')).toBeOnTheScreen());
    expect(screen.getByTestId('group-next-up')).toHaveTextContent(/Test 150 m/);
    expect(screen.getByTestId('group-sessions-scope')).toBeOnTheScreen();
  });

  it('bascule vers Calendrier', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('group-next-up')).toBeOnTheScreen());
    fireEvent.press(screen.getByLabelText('Calendrier'));
    expect(screen.getByTestId('group-calendar-period')).toHaveTextContent('Juin 2026');
  });

  it('bascule vers Coéquipiers (réutilisation ADR-37, non-régression)', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('group-next-up')).toBeOnTheScreen());
    fireEvent.press(screen.getByLabelText('Coéquipiers'));
    await waitFor(() => expect(screen.getByTestId('athlete-group-teammate-t-1')).toBeOnTheScreen());
  });

  it('onglet Infos : description + quitter le groupe', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('group-next-up')).toBeOnTheScreen());
    fireEvent.press(screen.getByLabelText('Infos'));
    expect(screen.getByTestId('athlete-group-description')).toHaveTextContent('Groupe de sprint');
    fireEvent.press(screen.getByTestId('athlete-group-leave'));
    await waitFor(() => expect(mockLeaveGroup).toHaveBeenCalledWith('g-1'));
  });

  it('ouvre le détail d’une séance au tap', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('group-next-up')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('group-next-up'));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: { id: 'today' } }));
  });
});
