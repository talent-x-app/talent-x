import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { dayKeyOf } from '../calendar/calendar-grid';

const mockListAssignments = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return { ...actual, listAssignments: (...a: unknown[]) => mockListAssignments(...a) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { GroupCalendarPane } from './GroupCalendarPane';

const TODAY = dayKeyOf(new Date());

function asg(id: string, coachId: string) {
  return {
    id,
    sessionId: `s-${id}`,
    athleteId: 'me',
    status: 'assigned',
    dueDate: TODAY,
    session: {
      id: `s-${id}`,
      title: `Séance ${id}`,
      status: 'published',
      coachId,
      exercises: { items: [] },
    },
  };
}

function renderPane() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    const [c] = useState(() => client);
    return (
      <QueryClientProvider client={c}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    );
  }
  render(
    <Wrapper>
      <GroupCalendarPane coachId="c-1" />
    </Wrapper>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GroupCalendarPane (ADR-47 — calendrier du groupe scopé au coach)', () => {
  it('n’affiche que les séances du coach du groupe (exclut les séances libres)', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          asg('coach', 'c-1'), // séance du coach du groupe
          asg('libre', 'me'), // séance libre de l'athlète (self_logged, coachId = athleteId)
        ],
      },
    });
    renderPane();
    await waitFor(() => expect(screen.getByTestId('group-calendar-period')).toBeOnTheScreen());
    // Jour du jour sélectionné par défaut : la séance du coach apparaît, pas la séance libre.
    await waitFor(() => expect(screen.getByTestId('session-item-coach')).toBeOnTheScreen());
    expect(screen.queryByTestId('session-item-libre')).toBeNull();
  });

  it('état erreur + réessai', async () => {
    mockListAssignments.mockResolvedValue({ status: 500 });
    renderPane();
    await waitFor(() => expect(screen.getByTestId('group-calendar-error')).toBeOnTheScreen());
  });
});
