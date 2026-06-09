import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetPerformance = jest.fn();
const mockListComments = jest.fn();
const mockCreateComment = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getPerformance: (...a: unknown[]) => mockGetPerformance(...a),
  listComments: (...a: unknown[]) => mockListComments(...a),
  createComment: (...a: unknown[]) => mockCreateComment(...a),
  getCoachDashboard: jest.fn(),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: 'asg-1', athlete: 'Léa Dubois', title: 'Haut du corps' }),
}));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { CoachReviewScreen } from './CoachReviewScreen';

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

const PERF = {
  id: 'perf-1',
  assignmentId: 'asg-1',
  athleteId: 'a-1',
  rpe: 7,
  notes: 'Bonnes sensations.',
  results: {
    items: [
      { exerciseName: 'Développé', setResults: [{ set: 1, completed: true }] },
      { exerciseName: 'Tractions', setResults: [{ set: 1, completed: false }] },
    ],
  },
  submittedAt: '2026-06-09T10:00:00.000Z',
};

const emptyComments = { status: 200, data: { data: [], meta: {} } };

beforeEach(() => jest.clearAllMocks());

describe('CoachReviewScreen (TLX-086 — C-08)', () => {
  it('affiche la performance de l’athlète et l’absence de feedback', async () => {
    mockGetPerformance.mockResolvedValue({ status: 200, data: PERF });
    mockListComments.mockResolvedValue(emptyComments);
    render(<CoachReviewScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('feedback-empty')).toBeOnTheScreen());
    expect(screen.getByTestId('review-title')).toHaveTextContent('Haut du corps');
    expect(screen.getByTestId('review-athlete-notes')).toHaveTextContent('Bonnes sensations.');
  });

  it('affiche les mesures v2 (temps / distance) quand présentes (ADR-19)', async () => {
    mockGetPerformance.mockResolvedValue({
      status: 200,
      data: {
        ...PERF,
        results: {
          schemaVersion: 2,
          items: [
            {
              exerciseName: '60m',
              order: 1,
              setResults: [
                { set: 1, timeSeconds: 7.45, completed: true },
                { set: 2, timeSeconds: 7.62, completed: true },
              ],
            },
            {
              exerciseName: 'Longueur',
              order: 2,
              setResults: [
                { set: 1, distanceMeters: 6.42, completed: true },
                { set: 2, failed: true, completed: true },
              ],
            },
          ],
        },
      },
    });
    mockListComments.mockResolvedValue(emptyComments);
    render(<CoachReviewScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('review-measures-0')).toBeOnTheScreen());
    expect(screen.getByTestId('review-measures-0')).toHaveTextContent('60m — 7.45 s · 7.62 s');
    expect(screen.getByTestId('review-measures-1')).toHaveTextContent('Longueur — 6.42 m · mordu');
  });

  it('affiche le fil de feedback existant', async () => {
    mockGetPerformance.mockResolvedValue({ status: 200, data: PERF });
    mockListComments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 'cm-1',
            authorId: 'c-1',
            performanceId: 'perf-1',
            body: 'Beau travail !',
            createdAt: '2026-06-09T11:00:00.000Z',
          },
        ],
        meta: {},
      },
    });
    render(<CoachReviewScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('comment-cm-1')).toBeOnTheScreen());
    expect(screen.getByText('Beau travail !')).toBeOnTheScreen();
  });

  it('envoie le feedback (createComment sur la performance) et vide le champ', async () => {
    mockGetPerformance.mockResolvedValue({ status: 200, data: PERF });
    mockListComments.mockResolvedValue(emptyComments);
    mockCreateComment.mockResolvedValue({ status: 201, data: { id: 'cm-2' } });
    render(<CoachReviewScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('feedback-send')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('feedback-input'), 'Garde le dos gainé.');
    fireEvent.press(screen.getByTestId('feedback-send'));

    await waitFor(() => expect(mockCreateComment).toHaveBeenCalled());
    expect(mockCreateComment).toHaveBeenCalledWith({
      performanceId: 'perf-1',
      body: 'Garde le dos gainé.',
    });
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' })),
    );
  });

  it('message dédié si consentement manquant (403)', async () => {
    mockGetPerformance.mockResolvedValue({ status: 403, data: { error: 'CONSENT_REQUIRED' } });
    render(<CoachReviewScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('review-consent')).toBeOnTheScreen());
    expect(screen.getByTestId('review-consent')).toHaveTextContent(/consentement requis/);
  });

  it('état erreur si la performance ne charge pas', async () => {
    mockGetPerformance.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachReviewScreen />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('review-error')).toBeOnTheScreen());
  });
});
