import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockGetCoachDashboard = jest.fn();
const mockGetCompetition = jest.fn();
const mockEngageAthletes = jest.fn();
const mockBack = jest.fn();
const mockShow = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  getCoachDashboard: (...a: unknown[]) => mockGetCoachDashboard(...a),
  getCompetition: (...a: unknown[]) => mockGetCompetition(...a),
  engageAthletes: (...a: unknown[]) => mockEngageAthletes(...a),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('../feedback', () => ({ useToast: () => ({ show: mockShow, dismiss: jest.fn() }) }));

import { CompetitionEngageScreen } from './CompetitionEngageScreen';

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

const DASHBOARD = {
  summary: {
    athleteCount: 2,
    toReview: 0,
    today: 0,
    alerts: { missedSessions: 0, consentMissing: 0 },
  },
  athletes: [
    {
      id: 'a-1',
      firstName: 'Nina',
      lastName: 'Koné',
      status: 'up_to_date',
      overdueCount: 0,
      toReviewCount: 0,
    },
    {
      id: 'a-2',
      firstName: 'Tom',
      lastName: 'Bah',
      status: 'late',
      overdueCount: 1,
      toReviewCount: 0,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCompetition.mockResolvedValue({
    status: 200,
    data: {
      id: 'k-1',
      coachId: 'me',
      name: 'Meeting de printemps',
      startDate: '2026-07-01',
      status: 'published',
    },
  });
});

describe('CompetitionEngageScreen (TLX-101)', () => {
  it('liste les athlètes liés et le nom de la compétition', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CompetitionEngageScreen competitionId="k-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('engage-athlete-a-1')).toBeOnTheScreen());
    expect(screen.getByTestId('engage-competition-name')).toHaveTextContent('Meeting de printemps');
  });

  it('bouton désactivé sans sélection', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CompetitionEngageScreen competitionId="k-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('engage-submit')).toBeOnTheScreen());
    expect(screen.getByTestId('engage-submit')).toBeDisabled();
  });

  it('engage (Idempotency-Key + eventLabel) puis confirme', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockEngageAthletes.mockResolvedValue({ status: 201, data: { data: [] } });
    render(<CompetitionEngageScreen competitionId="k-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('engage-athlete-a-1')).toBeOnTheScreen());
    fireEvent.changeText(screen.getByTestId('engage-event-label'), '100m');
    fireEvent.press(screen.getByTestId('engage-athlete-a-1'));
    fireEvent.press(screen.getByTestId('engage-athlete-a-2'));
    fireEvent.press(screen.getByTestId('engage-submit'));

    await waitFor(() => expect(mockEngageAthletes).toHaveBeenCalled());
    const [id, body, options] = mockEngageAthletes.mock.calls[0];
    expect(id).toBe('k-1');
    expect(body).toMatchObject({ athleteIds: ['a-1', 'a-2'], eventLabel: '100m' });
    expect(options.headers['Idempotency-Key']).toBe('engage-k-1-a-1-a-2');
    await waitFor(() => expect(screen.getByTestId('engage-confirmation')).toBeOnTheScreen());
  });

  it('toast d’erreur si l’engagement échoue', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockEngageAthletes.mockResolvedValue({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CompetitionEngageScreen competitionId="k-1" />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('engage-athlete-a-1')).toBeOnTheScreen());
    fireEvent.press(screen.getByTestId('engage-athlete-a-1'));
    fireEvent.press(screen.getByTestId('engage-submit'));
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ variant: 'danger' })),
    );
  });
});
