import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListComments = jest.fn();
const mockCreateComment = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listComments: (...a: unknown[]) => mockListComments(...a),
  createComment: (...a: unknown[]) => mockCreateComment(...a),
  getCoachDashboard: jest.fn(),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { FeedbackThread } from './FeedbackThread';

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

function renderThread() {
  return render(
    <FeedbackThread
      performanceId="perf-1"
      composerPlaceholder="Répondre…"
      sendLabel="Envoyer"
      emptyHint="Pas encore de retour."
    />,
    { wrapper: Wrapper },
  );
}

beforeEach(() => jest.clearAllMocks());

describe('FeedbackThread (TLX-086/092)', () => {
  it('affiche les commentaires existants de la performance', async () => {
    mockListComments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 'cm-1',
            authorId: 'c-1',
            performanceId: 'perf-1',
            body: 'Bien joué',
            createdAt: '2026-06-09T11:00:00.000Z',
          },
        ],
        meta: {},
      },
    });
    renderThread();

    await waitFor(() => expect(screen.getByTestId('comment-cm-1')).toBeOnTheScreen());
    expect(screen.getByText('Bien joué')).toBeOnTheScreen();
    expect(mockListComments).toHaveBeenCalledWith({ performanceId: 'perf-1' });
  });

  it('affiche un indice quand le fil est vide', async () => {
    mockListComments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
    renderThread();
    await waitFor(() => expect(screen.getByTestId('feedback-empty')).toBeOnTheScreen());
    expect(screen.getByTestId('feedback-empty')).toHaveTextContent('Pas encore de retour.');
  });

  it('poste un message (createComment) et vide le champ', async () => {
    mockListComments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
    mockCreateComment.mockResolvedValue({ status: 201, data: { id: 'cm-2' } });
    renderThread();

    await waitFor(() => expect(screen.getByTestId('feedback-send')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('feedback-input'), 'Merci coach !');
    fireEvent.press(screen.getByTestId('feedback-send'));

    await waitFor(() => expect(mockCreateComment).toHaveBeenCalled());
    expect(mockCreateComment).toHaveBeenCalledWith({
      performanceId: 'perf-1',
      body: 'Merci coach !',
    });
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    );
  });

  it('toast d’erreur si l’envoi échoue', async () => {
    mockListComments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
    mockCreateComment.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    renderThread();

    await waitFor(() => expect(screen.getByTestId('feedback-send')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('feedback-input'), 'test');
    fireEvent.press(screen.getByTestId('feedback-send'));
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })),
    );
  });
});

/** Rend le fil ciblant une **séance** (discussion pré-séance, TLX-118). */
function renderSessionThread() {
  return render(
    <FeedbackThread
      sessionId="sess-1"
      title="Discussion"
      composerPlaceholder="Une question ?"
      sendLabel="Envoyer"
      emptyHint="Aucun message sur cette séance."
    />,
    { wrapper: Wrapper },
  );
}

describe('FeedbackThread — cible séance (TLX-118)', () => {
  it('liste les commentaires de la séance via sessionId', async () => {
    mockListComments.mockResolvedValue({
      status: 200,
      data: {
        data: [{ id: 'cs-1', authorId: 'a-1', sessionId: 'sess-1', body: 'On commence quand ?' }],
        meta: {},
      },
    });
    renderSessionThread();

    await waitFor(() => expect(screen.getByTestId('comment-cs-1')).toBeOnTheScreen());
    expect(screen.getByText('On commence quand ?')).toBeOnTheScreen();
    expect(screen.getByText('Discussion')).toBeOnTheScreen();
    expect(mockListComments).toHaveBeenCalledWith({ sessionId: 'sess-1' });
  });

  it('poste sur la séance (createComment avec sessionId)', async () => {
    mockListComments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
    mockCreateComment.mockResolvedValue({ status: 201, data: { id: 'cs-2' } });
    renderSessionThread();

    await waitFor(() => expect(screen.getByTestId('feedback-send')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('feedback-input'), 'Quel échauffement ?');
    fireEvent.press(screen.getByTestId('feedback-send'));

    await waitFor(() => expect(mockCreateComment).toHaveBeenCalled());
    expect(mockCreateComment).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      body: 'Quel échauffement ?',
    });
  });
});
