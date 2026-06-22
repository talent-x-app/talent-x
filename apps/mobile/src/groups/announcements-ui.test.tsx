import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GroupAnnouncement } from '@talent-x/api-client';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockAddReaction = jest.fn();
const mockRemoveReaction = jest.fn();
const mockMarkRead = jest.fn();
const mockPulse = jest.fn();
const mockListAssignments = jest.fn();
const mockAttendanceSummary = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return {
    ...actual,
    listAnnouncements: (...a: unknown[]) => mockList(...a),
    createAnnouncement: (...a: unknown[]) => mockCreate(...a),
    deleteAnnouncement: (...a: unknown[]) => mockDelete(...a),
    addAnnouncementReaction: (...a: unknown[]) => mockAddReaction(...a),
    removeAnnouncementReaction: (...a: unknown[]) => mockRemoveReaction(...a),
    markAnnouncementRead: (...a: unknown[]) => mockMarkRead(...a),
    getTeamPulse: (...a: unknown[]) => mockPulse(...a),
    listAssignments: (...a: unknown[]) => mockListAssignments(...a),
    getAttendanceSummary: (...a: unknown[]) => mockAttendanceSummary(...a),
  };
});
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow }),
  toUserMessage: () => ({ title: 'Erreur', description: '' }),
}));

import { AnnouncementsPane } from './announcements-ui';

const NOW = new Date('2026-06-21T10:00:00.000Z');

function ann(id: string, body: string, extra?: Partial<GroupAnnouncement>): GroupAnnouncement {
  return {
    id,
    groupId: 'g-1',
    body,
    author: { id: 'c-1', firstName: 'Awa', lastName: 'Diallo' },
    createdAt: '2026-06-21T09:00:00.000Z',
    reactions: [],
    myReactions: [],
    readCount: 0,
    memberCount: 0,
    ...extra,
  } as GroupAnnouncement;
}

function renderPane(canManage: boolean, coachId?: string) {
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
      <AnnouncementsPane groupId="g-1" canManage={canManage} coachId={coachId} now={NOW} />
    </Wrapper>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ status: 200, data: { data: [] } });
  // Pouls : par défaut silencieux (échec → la carte ne s'affiche pas).
  mockPulse.mockRejectedValue({ status: 404 });
  mockMarkRead.mockResolvedValue({ status: 200, data: { readCount: 1, memberCount: 1 } });
  mockAddReaction.mockResolvedValue({ status: 200, data: { reactions: [], myReactions: [] } });
  mockRemoveReaction.mockResolvedValue({ status: 200, data: { reactions: [], myReactions: [] } });
  // Présence narrative : par défaut aucune séance à venir → bannière silencieuse.
  mockListAssignments.mockResolvedValue({ status: 200, data: { data: [] } });
  mockAttendanceSummary.mockResolvedValue({
    status: 200,
    data: { going: 0, notGoing: 0, maybe: 0, noResponse: 0, total: 0 },
  });
});

describe('AnnouncementsPane (ADR-46)', () => {
  it('athlète (lecture seule) : affiche les annonces, pas de zone de publication', async () => {
    mockList.mockResolvedValue({
      status: 200,
      data: { data: [ann('a1', 'Séance déplacée à 10h.')] },
    });
    renderPane(false);
    await waitFor(() => expect(screen.getByTestId('announcement-a1')).toBeOnTheScreen());
    expect(screen.getByText('Séance déplacée à 10h.')).toBeOnTheScreen();
    expect(screen.queryByTestId('announcement-input')).toBeNull();
    expect(screen.queryByTestId('announcement-delete-a1')).toBeNull();
  });

  it('état vide', async () => {
    renderPane(false);
    await waitFor(() => expect(screen.getByTestId('announcements-empty')).toBeOnTheScreen());
  });

  it('coach (canManage) : publie une annonce', async () => {
    mockCreate.mockResolvedValue({ status: 201, data: ann('a2', 'Compèt samedi !') });
    renderPane(true);
    await waitFor(() => expect(screen.getByTestId('announcement-input')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('announcement-input'), '  Compèt samedi !  ');
    fireEvent.press(screen.getByTestId('announcement-publish'));
    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith('g-1', { body: 'Compèt samedi !' }),
    );
    expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
  });

  it('coach (canManage) : supprime une annonce', async () => {
    mockList.mockResolvedValue({ status: 200, data: { data: [ann('a3', 'À supprimer')] } });
    mockDelete.mockResolvedValue({ status: 204 });
    renderPane(true);
    await waitFor(() => expect(screen.getByTestId('announcement-delete-a3')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('announcement-delete-a3'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('g-1', 'a3'));
  });
});

describe('AnnouncementsPane — réactions & lecture (ADR-48, Palier 1)', () => {
  it('athlète : marque l’annonce comme lue à l’affichage', async () => {
    mockList.mockResolvedValue({ status: 200, data: { data: [ann('a1', 'Coucou')] } });
    renderPane(false);
    await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith('g-1', 'a1'));
  });

  it('coach : ne marque PAS comme lu (il est l’auteur)', async () => {
    mockList.mockResolvedValue({ status: 200, data: { data: [ann('a1', 'Coucou')] } });
    renderPane(true);
    await waitFor(() => expect(screen.getByTestId('announcement-a1')).toBeOnTheScreen());
    expect(mockMarkRead).not.toHaveBeenCalled();
  });

  it('affiche les compteurs de réaction agrégés et la barre « X/Y lu »', async () => {
    mockList.mockResolvedValue({
      status: 200,
      data: {
        data: [
          ann('a1', 'Compèt', {
            reactions: [
              { emoji: '❤️', count: 8 },
              { emoji: '🔥', count: 5 },
            ],
            myReactions: ['❤️'],
            readCount: 9,
            memberCount: 12,
          }),
        ],
      },
    });
    renderPane(false);
    await waitFor(() => expect(screen.getByTestId('reaction-a1-❤️')).toBeOnTheScreen());
    expect(screen.getByText('8')).toBeOnTheScreen();
    expect(screen.getByText('5')).toBeOnTheScreen();
    expect(screen.getByTestId('read-count-a1')).toHaveTextContent('9/12 lu');
  });

  it('poser une réaction non encore présente → addAnnouncementReaction', async () => {
    mockList.mockResolvedValue({ status: 200, data: { data: [ann('a1', 'Compèt')] } });
    renderPane(false);
    await waitFor(() => expect(screen.getByTestId('reaction-add-a1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('reaction-add-a1'));
    fireEvent.press(screen.getByTestId('reaction-pick-a1-🔥'));
    await waitFor(() => expect(mockAddReaction).toHaveBeenCalledWith('g-1', 'a1', '🔥'));
    expect(mockRemoveReaction).not.toHaveBeenCalled();
  });

  it('retap d’une réaction déjà mienne → removeAnnouncementReaction (toggle)', async () => {
    mockList.mockResolvedValue({
      status: 200,
      data: {
        data: [
          ann('a1', 'Compèt', { reactions: [{ emoji: '❤️', count: 1 }], myReactions: ['❤️'] }),
        ],
      },
    });
    renderPane(false);
    await waitFor(() => expect(screen.getByTestId('reaction-a1-❤️')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('reaction-a1-❤️'));
    await waitFor(() => expect(mockRemoveReaction).toHaveBeenCalledWith('g-1', 'a1', '❤️'));
    expect(mockAddReaction).not.toHaveBeenCalled();
  });
});

describe('TeamPulseCard (ADR-48, Palier 1)', () => {
  it('affiche les agrégats dérivés de la semaine', async () => {
    mockList.mockResolvedValue({ status: 200, data: { data: [] } });
    mockPulse.mockResolvedValue({
      status: 200,
      data: {
        weekStart: '2026-06-22',
        completedSessions: 42,
        personalRecords: 8,
        attendanceRate: 93,
      },
    });
    renderPane(false);
    await waitFor(() => expect(screen.getByTestId('team-pulse')).toBeOnTheScreen());
    expect(screen.getByText('42')).toBeOnTheScreen();
    expect(screen.getByText('+8')).toBeOnTheScreen();
    expect(screen.getByText('93%')).toBeOnTheScreen();
  });

  it('semaine creuse (tout à zéro) → carte masquée', async () => {
    mockPulse.mockResolvedValue({
      status: 200,
      data: {
        weekStart: '2026-06-22',
        completedSessions: 0,
        personalRecords: 0,
        attendanceRate: null,
      },
    });
    renderPane(false);
    await waitFor(() => expect(screen.getByTestId('announcements-empty')).toBeOnTheScreen());
    expect(screen.queryByTestId('team-pulse')).toBeNull();
  });
});

describe('NarrativePresenceBanner (ADR-48, Palier 1 — slice 4)', () => {
  // NOW = dimanche 2026-06-21 ; séance du groupe le jeudi 2026-06-25.
  function groupAssignment(attendance?: string) {
    return {
      id: 'as-1',
      sessionId: 's-1',
      athleteId: 'a-1',
      status: 'assigned',
      attendance,
      session: { id: 's-1', title: 'Footing', coachId: 'coach-1', scheduledDate: '2026-06-25' },
    };
  }

  it('athlète : « N coéquipiers t’attendent » sur la prochaine séance du groupe', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: { data: [groupAssignment()] } });
    mockAttendanceSummary.mockResolvedValue({
      status: 200,
      data: { going: 6, notGoing: 0, maybe: 0, noResponse: 0, total: 6 },
    });
    renderPane(false, 'coach-1');
    await waitFor(() => expect(screen.getByTestId('narrative-presence')).toBeOnTheScreen());
    expect(screen.getByTestId('narrative-presence-text')).toHaveTextContent(
      /6 coéquipiers t'attendent/,
    );
    expect(screen.getByTestId('narrative-presence-text')).toHaveTextContent(/Footing/);
  });

  it('exclut sa propre réponse « going » du décompte des coéquipiers', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [groupAssignment('going')] },
    });
    mockAttendanceSummary.mockResolvedValue({
      status: 200,
      data: { going: 6, notGoing: 0, maybe: 0, noResponse: 0, total: 6 },
    });
    renderPane(false, 'coach-1');
    await waitFor(() => expect(screen.getByTestId('narrative-presence')).toBeOnTheScreen());
    // 6 going − soi = 5 coéquipiers, formulation « avec toi ».
    expect(screen.getByTestId('narrative-presence-text')).toHaveTextContent(
      /5 coéquipiers seront là avec toi/,
    );
  });

  it('personne d’autre confirmé → bannière silencieuse', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [groupAssignment('going')] },
    });
    mockAttendanceSummary.mockResolvedValue({
      status: 200,
      data: { going: 1, notGoing: 0, maybe: 0, noResponse: 4, total: 5 },
    });
    renderPane(false, 'coach-1');
    await waitFor(() => expect(screen.getByTestId('announcements-empty')).toBeOnTheScreen());
    expect(screen.queryByTestId('narrative-presence')).toBeNull();
  });

  it('côté coach (canManage) → pas de bannière narrative', async () => {
    mockListAssignments.mockResolvedValue({ status: 200, data: { data: [groupAssignment()] } });
    mockAttendanceSummary.mockResolvedValue({
      status: 200,
      data: { going: 6, notGoing: 0, maybe: 0, noResponse: 0, total: 6 },
    });
    renderPane(true, 'coach-1');
    await waitFor(() => expect(screen.getByTestId('announcements-empty')).toBeOnTheScreen());
    expect(screen.queryByTestId('narrative-presence')).toBeNull();
  });
});
