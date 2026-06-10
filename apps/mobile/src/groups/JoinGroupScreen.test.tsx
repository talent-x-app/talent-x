import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockJoinGroup = jest.fn();
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  joinGroup: (...a: unknown[]) => mockJoinGroup(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: undefined }),
}));

import { JoinGroupScreen } from './JoinGroupScreen';

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

beforeEach(() => jest.clearAllMocks());

describe('JoinGroupScreen (TLX-88)', () => {
  it('rejoint un groupe avec un code valide puis revient en arrière', async () => {
    mockJoinGroup.mockResolvedValue({ status: 200, data: { groupId: 'g-1', athleteId: 'me' } });
    render(<JoinGroupScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('join-group-code'), 'abcd2345');
    fireEvent.press(screen.getByTestId('join-group-submit'));

    await waitFor(() => expect(mockJoinGroup).toHaveBeenCalledWith({ inviteCode: 'ABCD2345' }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('met le code saisi en capitales', () => {
    render(<JoinGroupScreen />, { wrapper: Wrapper });
    const input = screen.getByTestId('join-group-code');
    fireEvent.changeText(input, 'wxyz9876');
    expect(input.props.value).toBe('WXYZ9876');
  });

  it('affiche un message inline sur code invalide (404)', async () => {
    mockJoinGroup.mockRejectedValue({ status: 404 });
    render(<JoinGroupScreen />, { wrapper: Wrapper });

    fireEvent.changeText(screen.getByTestId('join-group-code'), 'BADCODE1');
    fireEvent.press(screen.getByTestId('join-group-submit'));

    await waitFor(() => expect(screen.getByText(/Code invalide ou révoqué/i)).toBeOnTheScreen());
    expect(mockBack).not.toHaveBeenCalled();
  });
});
