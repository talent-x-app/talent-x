import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AnnouncementReply } from '@talent-x/api-client';

const mockListReplies = jest.fn();
const mockCreateReply = jest.fn();
const mockDeleteReply = jest.fn();
const mockReportReply = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return {
    ...actual,
    listAnnouncementReplies: (...a: unknown[]) => mockListReplies(...a),
    createAnnouncementReply: (...a: unknown[]) => mockCreateReply(...a),
    deleteAnnouncementReply: (...a: unknown[]) => mockDeleteReply(...a),
    reportAnnouncementReply: (...a: unknown[]) => mockReportReply(...a),
  };
});
jest.mock('../feedback', () => ({
  useToast: () => ({ show: mockShow }),
  toUserMessage: () => ({ title: 'Erreur', description: '' }),
}));

import { ReplyThread } from './announcement-replies-ui';

const NOW = new Date('2026-06-23T11:00:00.000Z');

function reply(over: Partial<AnnouncementReply> = {}): AnnouncementReply {
  return {
    id: 'r-1',
    announcementId: 'ann-1',
    author: { id: 'a-2', firstName: 'Karim', lastName: 'B' },
    body: 'Je serai là samedi !',
    createdAt: '2026-06-23T10:00:00.000Z',
    mine: false,
    canDelete: false,
    reportedByMe: false,
    hidden: false,
    ...over,
  };
}

function renderThread() {
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
      <ReplyThread groupId="g-1" announcementId="ann-1" now={NOW} />
    </Wrapper>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListReplies.mockResolvedValue({ status: 200, data: { data: [] } });
  mockCreateReply.mockResolvedValue({ status: 201, data: reply({ mine: true }) });
  mockDeleteReply.mockResolvedValue({ status: 204 });
  mockReportReply.mockResolvedValue({ status: 200, data: reply({ reportedByMe: true }) });
});

describe('ReplyThread (ADR-50)', () => {
  it('affiche une réponse avec auteur et corps', async () => {
    mockListReplies.mockResolvedValue({ status: 200, data: { data: [reply()] } });
    renderThread();
    await waitFor(() => expect(screen.getByTestId('reply-r-1')).toBeOnTheScreen());
    expect(screen.getByText('Je serai là samedi !')).toBeOnTheScreen();
    expect(screen.getByText(/Karim B/)).toBeOnTheScreen();
  });

  it('envoie une réponse', async () => {
    renderThread();
    await waitFor(() => expect(screen.getByTestId('reply-input-ann-1')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('reply-input-ann-1'), 'Présent !');
    fireEvent.press(screen.getByTestId('reply-send-ann-1'));
    await waitFor(() =>
      expect(mockCreateReply).toHaveBeenCalledWith('g-1', 'ann-1', { body: 'Présent !' }),
    );
  });

  it('auteur/coach : bouton supprimer ; supprime la réponse', async () => {
    mockListReplies.mockResolvedValue({
      status: 200,
      data: { data: [reply({ canDelete: true })] },
    });
    renderThread();
    await waitFor(() => expect(screen.getByTestId('reply-delete-r-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('reply-delete-r-1'));
    await waitFor(() => expect(mockDeleteReply).toHaveBeenCalledWith('g-1', 'ann-1', 'r-1'));
  });

  it('membre : signale une réponse via un motif borné', async () => {
    mockListReplies.mockResolvedValue({ status: 200, data: { data: [reply()] } });
    renderThread();
    await waitFor(() => expect(screen.getByTestId('reply-report-r-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('reply-report-r-1'));
    await waitFor(() => expect(screen.getByTestId('reply-report-r-1-offensive')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('reply-report-r-1-offensive'));
    await waitFor(() =>
      expect(mockReportReply).toHaveBeenCalledWith('g-1', 'ann-1', 'r-1', { reason: 'offensive' }),
    );
  });

  it('coach : réponse masquée affiche le compteur de signalements', async () => {
    mockListReplies.mockResolvedValue({
      status: 200,
      data: { data: [reply({ hidden: true, reportCount: 3 })] },
    });
    renderThread();
    await waitFor(() => expect(screen.getByTestId('reply-reports-r-1')).toBeOnTheScreen());
    expect(screen.getByText(/Masquée · 3 signalements/)).toBeOnTheScreen();
  });
});
