import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMyGroups = jest.fn();
const mockGetGroupTeammates = jest.fn();
const mockLeaveGroup = jest.fn();
const mockListNotifications = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return {
    ...actual,
    getMyGroups: (...a: unknown[]) => mockGetMyGroups(...a),
    getGroupTeammates: (...a: unknown[]) => mockGetGroupTeammates(...a),
    leaveGroup: (...a: unknown[]) => mockLeaveGroup(...a),
    listNotifications: (...a: unknown[]) => mockListNotifications(...a),
  };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));
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

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMyGroups.mockResolvedValue(GROUPS);
  mockGetGroupTeammates.mockResolvedValue({
    status: 200,
    data: { data: [{ id: 't-1', firstName: 'Awa', lastName: 'Traoré' }] },
  });
  mockLeaveGroup.mockResolvedValue({ status: 204 });
  mockListNotifications.mockResolvedValue({ status: 200, data: { data: [] } });
  mockBack.mockReset();
  mockShow.mockReset();
});

function renderHub(props?: { showBack?: boolean }) {
  return render(
    <Wrapper>
      <AthleteGroupHubScreen groupId="g-1" {...props} />
    </Wrapper>,
  );
}

describe('AthleteGroupHubScreen (ADR-44 — hub mince)', () => {
  it('en-tête nom + coach · N athlètes, Coéquipiers par défaut (roster ADR-37)', async () => {
    renderHub();
    await waitFor(() =>
      expect(screen.getByTestId('athlete-group-name')).toHaveTextContent('Sprint Élite'),
    );
    expect(screen.getByText(/Coach Mamadou Diallo · 12 athlètes/)).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('athlete-group-teammate-t-1')).toBeOnTheScreen());
  });

  it('ne montre pas de fil/calendrier de séances (recentrage ADR-44 §1)', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('athlete-group-tabs')).toBeOnTheScreen());
    expect(screen.queryByTestId('group-next-up')).toBeNull();
    expect(screen.queryByLabelText('Calendrier')).toBeNull();
    expect(screen.queryByLabelText('Séances')).toBeNull();
  });

  it('bouton retour masquable (racine d’onglet)', async () => {
    renderHub({ showBack: false });
    await waitFor(() => expect(screen.getByTestId('athlete-group-tabs')).toBeOnTheScreen());
    expect(screen.queryByTestId('athlete-group-back')).toBeNull();
  });

  it('Infos : quitter le groupe demande confirmation puis appelle leaveGroup', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('athlete-group-tabs')).toBeOnTheScreen());
    fireEvent.press(screen.getByLabelText('Infos'));
    expect(screen.getByTestId('athlete-group-description')).toHaveTextContent('Groupe de sprint');

    // 1er tap : pas d'appel, on demande confirmation.
    fireEvent.press(screen.getByTestId('athlete-group-leave'));
    expect(mockLeaveGroup).not.toHaveBeenCalled();
    expect(screen.getByTestId('athlete-group-leave-confirm')).toBeOnTheScreen();

    // Confirmation → appel.
    fireEvent.press(screen.getByTestId('athlete-group-leave-confirm'));
    await waitFor(() => expect(mockLeaveGroup).toHaveBeenCalledWith('g-1'));
  });

  it('Infos : annuler la confirmation ne quitte pas', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('athlete-group-tabs')).toBeOnTheScreen());
    fireEvent.press(screen.getByLabelText('Infos'));
    fireEvent.press(screen.getByTestId('athlete-group-leave'));
    fireEvent.press(screen.getByTestId('athlete-group-leave-cancel'));
    expect(screen.getByTestId('athlete-group-leave')).toBeOnTheScreen();
    expect(mockLeaveGroup).not.toHaveBeenCalled();
  });
});
