import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMyGroups = jest.fn();
const mockGetGroupTeammates = jest.fn();
const mockGetMe = jest.fn();
const mockLeaveGroup = jest.fn();
const mockListNotifications = jest.fn();
const mockListAnnouncements = jest.fn();
const mockListAssignments = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return {
    ...actual,
    getMyGroups: (...a: unknown[]) => mockGetMyGroups(...a),
    getGroupTeammates: (...a: unknown[]) => mockGetGroupTeammates(...a),
    getMe: (...a: unknown[]) => mockGetMe(...a),
    leaveGroup: (...a: unknown[]) => mockLeaveGroup(...a),
    listNotifications: (...a: unknown[]) => mockListNotifications(...a),
    listAnnouncements: (...a: unknown[]) => mockListAnnouncements(...a),
    listAssignments: (...a: unknown[]) => mockListAssignments(...a),
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
  mockGetMe.mockResolvedValue({ status: 200, data: { id: 'self-1', role: 'athlete' } });
  mockListAnnouncements.mockResolvedValue({ status: 200, data: { data: [] } });
  mockListAssignments.mockResolvedValue({ status: 200, data: { data: [] } });
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
  it('en-tête nom + coach · N athlètes ; Annonces par défaut, puis Coéquipiers (roster ADR-37)', async () => {
    renderHub();
    await waitFor(() =>
      expect(screen.getByTestId('athlete-group-name')).toHaveTextContent('Sprint Élite'),
    );
    expect(screen.getByText(/Coach Mamadou Diallo · 12 athlètes/)).toBeOnTheScreen();
    // Onglet Annonces par défaut (ADR-46) : état vide visible, pas encore le roster.
    await waitFor(() => expect(screen.getByTestId('announcements-empty')).toBeOnTheScreen());
    expect(screen.queryByTestId('athlete-group-teammate-t-1')).toBeNull();
    // Bascule Coéquipiers → roster.
    fireEvent.press(screen.getByLabelText('Coéquipiers'));
    await waitFor(() => expect(screen.getByTestId('athlete-group-teammate-t-1')).toBeOnTheScreen());
  });

  it('Coéquipiers : carte « Ton coach » + date d’adhésion + exclusion de soi (#2/#3)', async () => {
    // Le roster inclut l'appelant (ADR-37) : self-1 + un coéquipier t-1.
    mockGetGroupTeammates.mockResolvedValue({
      status: 200,
      data: {
        data: [
          { id: 'self-1', firstName: 'Moi', lastName: 'Même' },
          { id: 't-1', firstName: 'Awa', lastName: 'Traoré' },
        ],
      },
    });
    renderHub();
    await waitFor(() => expect(screen.getByTestId('athlete-group-tabs')).toBeOnTheScreen());
    fireEvent.press(screen.getByLabelText('Coéquipiers'));
    await waitFor(() => expect(screen.getByTestId('athlete-group-coach')).toBeOnTheScreen());
    expect(screen.getByTestId('athlete-group-coach')).toHaveTextContent(/Mamadou Diallo/);
    expect(screen.getByTestId('athlete-group-joined-at')).toBeOnTheScreen();
    // L'appelant (self-1) est exclu de la liste des coéquipiers ; t-1 reste.
    await waitFor(() => expect(screen.getByTestId('athlete-group-teammate-t-1')).toBeOnTheScreen());
    expect(screen.queryByTestId('athlete-group-teammate-self-1')).toBeNull();
  });

  it('Coéquipiers : photo du coach quand il en a une (TLX-252, ADR-37 §A1)', async () => {
    mockGetMyGroups.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            ...GROUPS.data.data[0],
            coach: {
              id: 'c',
              firstName: 'Mamadou',
              lastName: 'Diallo',
              avatarUrl: 'https://signed/coach',
            },
          },
        ],
      },
    });
    mockGetGroupTeammates.mockResolvedValue({ status: 200, data: { data: [] } });
    renderHub();
    await waitFor(() => expect(screen.getByTestId('athlete-group-tabs')).toBeOnTheScreen());

    fireEvent.press(screen.getByLabelText('Coéquipiers'));
    await waitFor(() => expect(screen.getByTestId('athlete-group-coach')).toBeOnTheScreen());
    const avatar = screen.getByTestId('athlete-group-coach-avatar');
    expect(avatar.props.source).toEqual({ uri: 'https://signed/coach' });
    expect(screen.queryByTestId('athlete-group-coach-initials')).toBeNull();
  });

  it('Coéquipiers : coach sans photo → initiales (repli)', async () => {
    // `GROUPS` porte un coach **sans** `avatarUrl` — cas par défaut du contrat.
    mockGetGroupTeammates.mockResolvedValue({ status: 200, data: { data: [] } });
    renderHub();
    await waitFor(() => expect(screen.getByTestId('athlete-group-tabs')).toBeOnTheScreen());

    fireEvent.press(screen.getByLabelText('Coéquipiers'));
    await waitFor(() => expect(screen.getByTestId('athlete-group-coach')).toBeOnTheScreen());
    expect(screen.getByTestId('athlete-group-coach-initials')).toHaveTextContent('MD');
    expect(screen.queryByTestId('athlete-group-coach-avatar')).toBeNull();
  });

  it('pas de fil « Séances » dans le hub ; calendrier du groupe présent (ADR-47)', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByTestId('athlete-group-tabs')).toBeOnTheScreen());
    // Pas de fil de séances dupliqué (ADR-44) ni d'onglet « Séances ».
    expect(screen.queryByTestId('group-next-up')).toBeNull();
    expect(screen.queryByLabelText('Séances')).toBeNull();
    // Mais un onglet « Calendrier » du groupe (ADR-47) → grille mois au tap.
    fireEvent.press(screen.getByLabelText('Calendrier'));
    await waitFor(() => expect(screen.getByTestId('group-calendar-period')).toBeOnTheScreen());
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
