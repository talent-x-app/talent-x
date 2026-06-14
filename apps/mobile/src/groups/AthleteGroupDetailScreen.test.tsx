import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetMyGroups = jest.fn();
const mockGetGroupTeammates = jest.fn();
const mockLeaveGroup = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getMyGroups: (...a: unknown[]) => mockGetMyGroups(...a),
  getGroupTeammates: (...a: unknown[]) => mockGetGroupTeammates(...a),
  leaveGroup: (...a: unknown[]) => mockLeaveGroup(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow, dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: undefined }),
}));

import { AthleteGroupDetailScreen } from './AthleteGroupDetailScreen';

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
  description: 'Groupe de vitesse',
  memberCount: 2,
  joinedAt: '2026-02-01T00:00:00.000Z',
  coach: { id: 'c-1', firstName: 'Aïssata', lastName: 'Diallo' },
};

const TEAMMATES = [
  { id: 'a-1', firstName: 'Léa', lastName: 'Dubois', avatarUrl: 'https://signed/lea' },
  { id: 'a-2', firstName: 'Tom', lastName: 'Petit' },
];

beforeEach(() => jest.clearAllMocks());

describe('AthleteGroupDetailScreen (ADR-37)', () => {
  it('affiche le méta du groupe (nom/description/coach) + le roster des coéquipiers', async () => {
    mockGetMyGroups.mockResolvedValue({ status: 200, data: { data: [GROUP] } });
    mockGetGroupTeammates.mockResolvedValue({ status: 200, data: { data: TEAMMATES } });
    render(<AthleteGroupDetailScreen groupId="g-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('athlete-group-teammate-a-1')).toBeOnTheScreen());
    expect(screen.getByTestId('athlete-group-name')).toHaveTextContent('Sprint élite');
    expect(screen.getByText('Groupe de vitesse')).toBeOnTheScreen();
    expect(screen.getByText(/Coach : Aïssata Diallo/)).toBeOnTheScreen();
    // Roster minimisé : identités présentes (nœud nom distinct des initiales).
    expect(screen.getByText('Léa Dubois')).toBeOnTheScreen();
    expect(screen.getByText('Tom Petit')).toBeOnTheScreen();
    // Avatar présigné → <Image> ; sans avatar → initiales (pas d'image).
    expect(screen.getByTestId('athlete-group-teammate-a-1-avatar')).toBeOnTheScreen();
    expect(screen.queryByTestId('athlete-group-teammate-a-2-avatar')).toBeNull();
    expect(mockGetGroupTeammates).toHaveBeenCalledWith('g-1');
  });

  it('quitte le groupe (leave + retour)', async () => {
    mockGetMyGroups.mockResolvedValue({ status: 200, data: { data: [GROUP] } });
    mockGetGroupTeammates.mockResolvedValue({ status: 200, data: { data: TEAMMATES } });
    mockLeaveGroup.mockResolvedValue({ status: 204 });
    render(<AthleteGroupDetailScreen groupId="g-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('athlete-group-leave')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('athlete-group-leave'));
    await waitFor(() => expect(mockLeaveGroup).toHaveBeenCalledWith('g-1'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('roster vide → état « seul dans le groupe »', async () => {
    mockGetMyGroups.mockResolvedValue({ status: 200, data: { data: [GROUP] } });
    mockGetGroupTeammates.mockResolvedValue({ status: 200, data: { data: [] } });
    render(<AthleteGroupDetailScreen groupId="g-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('athlete-group-teammates-empty')).toBeOnTheScreen(),
    );
  });

  it('erreur roster (404 non-membre) → état erreur + réessai', async () => {
    mockGetMyGroups.mockResolvedValue({ status: 200, data: { data: [] } });
    mockGetGroupTeammates.mockResolvedValueOnce({ status: 404, data: { error: 'NOT_FOUND' } });
    render(<AthleteGroupDetailScreen groupId="g-1" />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('athlete-group-teammates-error')).toBeOnTheScreen(),
    );
    mockGetGroupTeammates.mockResolvedValueOnce({ status: 200, data: { data: TEAMMATES } });
    fireEvent.press(screen.getByTestId('athlete-group-teammates-retry'));
    await waitFor(() => expect(screen.getByTestId('athlete-group-teammate-a-1')).toBeOnTheScreen());
  });
});
