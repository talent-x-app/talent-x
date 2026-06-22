import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { dayKeyOf } from './calendar-grid';

const mockListAssignments = jest.fn();
const mockPush = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return { ...actual, listAssignments: (...args: unknown[]) => mockListAssignments(...args) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

import { AthleteCalendarScreen } from './AthleteCalendarScreen';

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

// Séance datée AUJOURD'HUI → visible dans le jour sélectionné par défaut (déterministe).
const TODAY = dayKeyOf(new Date());
const PAGE = {
  data: [
    {
      id: 'as-1',
      sessionId: 's-1',
      athleteId: 'me',
      status: 'assigned',
      dueDate: TODAY,
      session: {
        id: 's-1',
        title: 'Sprint 60m',
        status: 'published',
        coachId: 'c-1',
        exercises: { items: [] },
      },
    },
  ],
  meta: { total: 1, page: 1, limit: 20 },
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AthleteCalendarScreen (A-08 / ADR-47 — vue mois)', () => {
  it('rend la grille (mois) + le lien compétitions, et la séance du jour', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteCalendarScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('calendar-period')).toBeOnTheScreen());
    expect(screen.getByTestId('calendar-mode')).toBeOnTheScreen();
    expect(screen.getByTestId('calendar-competitions-link')).toBeOnTheScreen();
    // Séance d'aujourd'hui listée sous le jour sélectionné par défaut.
    await waitFor(() => expect(screen.getByTestId('session-item-as-1')).toBeOnTheScreen());
    expect(screen.getByText('Sprint 60m')).toBeOnTheScreen();
  });

  it('bascule Mois → Semaine', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteCalendarScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('calendar-mode')).toBeOnTheScreen());
    fireEvent.press(screen.getByLabelText('Semaine'));
    expect(screen.getByTestId('calendar-period')).toBeOnTheScreen();
  });

  it('ouvre le détail de la séance au tap', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: PAGE });
    render(<AthleteCalendarScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('session-item-as-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('session-item-as-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ id: 'as-1' }) }),
    );
  });

  it('état erreur + réessai', async () => {
    mockListAssignments.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<AthleteCalendarScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('calendar-error')).toBeOnTheScreen());

    mockListAssignments.mockResolvedValueOnce({ status: 200, data: PAGE });
    fireEvent.press(screen.getByTestId('calendar-retry'));
    await waitFor(() => expect(screen.getByTestId('calendar-period')).toBeOnTheScreen());
  });
});
