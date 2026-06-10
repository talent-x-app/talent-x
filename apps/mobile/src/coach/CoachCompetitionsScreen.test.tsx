import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListCompetitions = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listCompetitions: (...args: unknown[]) => mockListCompetitions(...args),
  CompetitionStatus: { draft: 'draft', published: 'published', cancelled: 'cancelled' },
  CompetitionEntryStatus: { engaged: 'engaged', confirmed: 'confirmed', withdrawn: 'withdrawn' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));

import { CoachCompetitionsScreen } from './CoachCompetitionsScreen';

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

const PAGE = {
  data: [
    {
      id: 'k-1',
      coachId: 'me',
      name: 'Meeting de printemps',
      location: 'Paris',
      startDate: '2026-07-01',
      status: 'published',
    },
  ],
  meta: { total: 1, page: 1, limit: 20 },
};

beforeEach(() => jest.clearAllMocks());

describe('CoachCompetitionsScreen (TLX-101)', () => {
  it('rend la liste des compétitions du coach', async () => {
    mockListCompetitions.mockResolvedValue({ status: 200, data: PAGE });
    render(<CoachCompetitionsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('competition-item-k-1')).toBeOnTheScreen());
    expect(screen.getByText('Meeting de printemps')).toBeOnTheScreen();
    expect(screen.getByText('Publiée')).toBeOnTheScreen();
  });

  it('navigue vers la création', async () => {
    mockListCompetitions.mockResolvedValue({ status: 200, data: PAGE });
    render(<CoachCompetitionsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('competition-create')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('competition-create'));
    expect(mockPush).toHaveBeenCalledWith('/(coach)/competition/new');
  });

  it('ouvre l’édition au tap sur une compétition', async () => {
    mockListCompetitions.mockResolvedValue({ status: 200, data: PAGE });
    render(<CoachCompetitionsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('competition-item-k-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('competition-item-k-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/competition/[id]',
        params: expect.objectContaining({ id: 'k-1' }),
      }),
    );
  });

  it('état vide quand aucune compétition', async () => {
    mockListCompetitions.mockResolvedValue({
      status: 200,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    });
    render(<CoachCompetitionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('competitions-empty')).toBeOnTheScreen());
  });

  it('état erreur + réessai', async () => {
    mockListCompetitions.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachCompetitionsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('competitions-error')).toBeOnTheScreen());

    mockListCompetitions.mockResolvedValueOnce({ status: 200, data: PAGE });
    fireEvent.press(screen.getByTestId('competitions-retry'));
    await waitFor(() => expect(screen.getByTestId('competition-item-k-1')).toBeOnTheScreen());
  });
});
