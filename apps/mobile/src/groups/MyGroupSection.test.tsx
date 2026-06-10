import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetMyGroups = jest.fn();
const mockLeaveGroup = jest.fn();
const mockPush = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getMyGroups: (...a: unknown[]) => mockGetMyGroups(...a),
  leaveGroup: (...a: unknown[]) => mockLeaveGroup(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: undefined }),
}));

import { MyGroupSection } from './MyGroupSection';

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

const GROUP = {
  id: 'g-1',
  name: 'Sprint élite',
  memberCount: 4,
  coach: { id: 'c-1', firstName: 'Aïssata', lastName: 'Diallo' },
};

beforeEach(() => jest.clearAllMocks());

describe('MyGroupSection (TLX-88, ADR-26)', () => {
  it('rend le groupe rejoint avec coach et effectif', async () => {
    mockGetMyGroups.mockResolvedValue({ status: 200, data: { data: [GROUP] } });
    render(<MyGroupSection />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('my-group-g-1')).toBeOnTheScreen());
    expect(screen.getByText('Sprint élite')).toBeOnTheScreen();
    expect(screen.getByText(/Aïssata Diallo · 4 membres/)).toBeOnTheScreen();
  });

  it('quitte un groupe', async () => {
    mockGetMyGroups.mockResolvedValue({ status: 200, data: { data: [GROUP] } });
    mockLeaveGroup.mockResolvedValue({ status: 204 });
    render(<MyGroupSection />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('my-group-leave-g-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('my-group-leave-g-1'));
    await waitFor(() => expect(mockLeaveGroup).toHaveBeenCalledWith('g-1'));
  });

  it('état vide → CTA rejoindre', async () => {
    mockGetMyGroups.mockResolvedValue({ status: 200, data: { data: [] } });
    render(<MyGroupSection />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('my-group-empty')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('my-group-join'));
    expect(mockPush).toHaveBeenCalledWith('/(athlete)/group/join');
  });

  it('état erreur + réessai', async () => {
    mockGetMyGroups.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<MyGroupSection />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('my-group-error')).toBeOnTheScreen());

    mockGetMyGroups.mockResolvedValueOnce({ status: 200, data: { data: [GROUP] } });
    fireEvent.press(screen.getByTestId('my-group-retry'));
    await waitFor(() => expect(screen.getByTestId('my-group-g-1')).toBeOnTheScreen());
  });
});
