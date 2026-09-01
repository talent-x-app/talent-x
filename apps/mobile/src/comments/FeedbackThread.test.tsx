import { ThemeProvider, darkColors, darkTheme } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { type ReactNode, useState } from 'react';

const mockListComments = jest.fn();
const mockCreateComment = jest.fn();
const mockShow = jest.fn();
const mockDeleteComment = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listComments: (...a: unknown[]) => mockListComments(...a),
  createComment: (...a: unknown[]) => mockCreateComment(...a),
  deleteComment: (...a: unknown[]) => mockDeleteComment(...a),
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

/** Thème sombre forcé — assertions de contraste (TLX-151). */
function DarkWrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>
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

  /**
   * TLX-256 — `deleteComment` était implémentée, autorisée (403 sur le message d'autrui) et
   * publiée dans le client généré, **sans aucun appelant** : un athlète qui postait un message
   * maladroit ou sur la mauvaise séance n'avait aucun moyen de le retirer. C'est celle des
   * quatre opérations orphelines qui pesait le plus lourd.
   */
  describe('suppression de son propre message (TLX-256)', () => {
    /** Fil à deux messages : un du coach, un de l'utilisateur courant. */
    function twoAuthors() {
      mockListComments.mockResolvedValue({
        status: 200,
        data: {
          data: [
            { id: 'cm-coach', authorId: 'c-1', body: 'Bien joué', createdAt: null },
            { id: 'cm-mine', authorId: 'me-1', body: 'Merci !', createdAt: null },
          ],
          meta: {},
        },
      });
    }

    /** Rend le fil avec un cache `['me']` déjà chaud — l'identité n'ajoute aucune requête. */
    function renderWithMe(meId: string | null) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      if (meId) client.setQueryData(['me'], { id: meId });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryClientProvider>
      );
      return render(
        <FeedbackThread
          performanceId="perf-1"
          composerPlaceholder="Écrire…"
          sendLabel="Envoyer"
          emptyHint="Pas encore de retour."
        />,
        { wrapper },
      );
    }

    it('propose la suppression sur le sien, jamais sur celui d’un autre', async () => {
      twoAuthors();
      renderWithMe('me-1');

      await waitFor(() => expect(screen.getByTestId('comment-cm-mine')).toBeOnTheScreen());
      expect(screen.getByTestId('comment-delete-cm-mine')).toBeOnTheScreen();
      // Le serveur refuserait par 403 : l'écran ne doit pas proposer un geste voué à l'échec.
      expect(screen.queryByTestId('comment-delete-cm-coach')).toBeNull();
    });

    it('supprime après confirmation, et recharge le fil', async () => {
      twoAuthors();
      mockDeleteComment.mockResolvedValue({ status: 204 });
      renderWithMe('me-1');
      await waitFor(() => expect(screen.getByTestId('comment-delete-cm-mine')).toBeOnTheScreen());

      // Confirmation inline, comme les autres gestes destructifs (TLX-194/245/250).
      fireEvent.press(screen.getByTestId('comment-delete-cm-mine'));
      fireEvent.press(await screen.findByTestId('comment-delete-confirm-cm-mine'));

      await waitFor(() => expect(mockDeleteComment).toHaveBeenCalledWith('cm-mine'));
    });

    it('identité inconnue → aucune action proposée (repli sûr)', async () => {
      // L'identité vient du cache `['me']`, sans requête ajoutée : là où il est froid, l'action
      // est simplement absente. Au pire on n'offre rien, jamais on ne propose à tort.
      twoAuthors();
      renderWithMe(null);

      await waitFor(() => expect(screen.getByTestId('comment-cm-mine')).toBeOnTheScreen());
      expect(screen.queryByTestId('comment-delete-cm-mine')).toBeNull();
    });
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

  it('date d’un commentaire en textSecondary — contraste AA (TLX-151)', async () => {
    mockListComments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 'cm-9',
            authorId: 'c-1',
            performanceId: 'perf-1',
            body: 'Beau chrono',
            createdAt: '2026-06-09T11:00:00.000Z',
          },
        ],
        meta: {},
      },
    });
    render(
      <FeedbackThread
        performanceId="perf-1"
        composerPlaceholder="Répondre…"
        sendLabel="Envoyer"
        emptyHint="Pas encore de retour."
      />,
      { wrapper: DarkWrapper },
    );
    await waitFor(() => expect(screen.getByText('Beau chrono')).toBeOnTheScreen());
    const date = screen.getByText(/9 juin/);
    expect((StyleSheet.flatten(date.props.style) as { color?: string }).color).toBe(
      darkColors.textSecondary,
    );
  });
});
