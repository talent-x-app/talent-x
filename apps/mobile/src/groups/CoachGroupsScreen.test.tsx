import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListGroups = jest.fn();
const mockCreateGroup = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listGroups: (...a: unknown[]) => mockListGroups(...a),
  createGroup: (...a: unknown[]) => mockCreateGroup(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: undefined }),
}));

import { CoachGroupsScreen } from './CoachGroupsScreen';

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
  data: [{ id: 'g-1', coachId: 'me', name: 'Sprint élite', memberCount: 3 }],
  meta: { total: 1, page: 1, limit: 20 },
};

beforeEach(() => jest.clearAllMocks());

describe('CoachGroupsScreen (TLX-87)', () => {
  it('rend la liste des groupes du coach', async () => {
    mockListGroups.mockResolvedValue({ status: 200, data: PAGE });
    render(<CoachGroupsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('group-item-g-1')).toBeOnTheScreen());
    expect(screen.getByText('Sprint élite')).toBeOnTheScreen();
    expect(screen.getByText('3 membres')).toBeOnTheScreen();
  });

  it('ouvre le détail au tap sur un groupe', async () => {
    mockListGroups.mockResolvedValue({ status: 200, data: PAGE });
    render(<CoachGroupsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('group-item-g-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('group-item-g-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/(coach)/group/[id]', params: { id: 'g-1' } }),
    );
  });

  it('crée un groupe puis ouvre son détail', async () => {
    mockListGroups.mockResolvedValue({ status: 200, data: PAGE });
    mockCreateGroup.mockResolvedValue({ status: 201, data: { id: 'g-2', name: 'Demi-fond' } });
    render(<CoachGroupsScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('group-create')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('group-create'));
    fireEvent.changeText(screen.getByTestId('group-create-name'), 'Demi-fond');
    fireEvent.press(screen.getByTestId('group-create-submit'));

    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledWith({ name: 'Demi-fond' }));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({ pathname: '/(coach)/group/[id]', params: { id: 'g-2' } }),
      ),
    );
  });

  it('état vide quand aucun groupe', async () => {
    mockListGroups.mockResolvedValue({
      status: 200,
      data: { data: [], meta: { total: 0, page: 1, limit: 20 } },
    });
    render(<CoachGroupsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('groups-empty')).toBeOnTheScreen());
  });

  it('état erreur + réessai', async () => {
    mockListGroups.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachGroupsScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('groups-error')).toBeOnTheScreen());

    mockListGroups.mockResolvedValueOnce({ status: 200, data: PAGE });
    fireEvent.press(screen.getByTestId('groups-retry'));
    await waitFor(() => expect(screen.getByTestId('group-item-g-1')).toBeOnTheScreen());
  });
});
