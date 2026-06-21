import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GroupAnnouncement } from '@talent-x/api-client';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return {
    ...actual,
    listAnnouncements: (...a: unknown[]) => mockList(...a),
    createAnnouncement: (...a: unknown[]) => mockCreate(...a),
    deleteAnnouncement: (...a: unknown[]) => mockDelete(...a),
  };
});
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow }),
  toUserMessage: () => ({ title: 'Erreur', description: '' }),
}));

import { AnnouncementsPane } from './announcements-ui';

const NOW = new Date('2026-06-21T10:00:00.000Z');

function ann(id: string, body: string): GroupAnnouncement {
  return {
    id,
    groupId: 'g-1',
    body,
    author: { id: 'c-1', firstName: 'Awa', lastName: 'Diallo' },
    createdAt: '2026-06-21T09:00:00.000Z',
  } as GroupAnnouncement;
}

function renderPane(canManage: boolean) {
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
      <AnnouncementsPane groupId="g-1" canManage={canManage} now={NOW} />
    </Wrapper>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ status: 200, data: { data: [] } });
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
