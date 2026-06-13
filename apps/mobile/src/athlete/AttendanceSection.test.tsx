import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';

const mockListAssignments = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listAssignments: (...a: unknown[]) => mockListAssignments(...a),
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
}));

import { AttendanceCard, AttendanceSection, StreakBadge } from './AttendanceSection';
import { type Attendance } from './attendance';

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

/** Date du jour (UTC) moins `days` jours, au format date du contrat. */
function daysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const ATTENDANCE: Attendance = {
  currentStreakWeeks: 3,
  bestStreakWeeks: 5,
  monthCompleted: 6,
  monthTotal: 8,
  monthCompletionRate: 0.75,
};

describe('AttendanceCard (TLX-115)', () => {
  it('rend la série en cours, le record et le taux du mois', () => {
    render(<AttendanceCard attendance={ATTENDANCE} />, { wrapper: Wrapper });
    expect(screen.getByTestId('attendance-streak')).toHaveTextContent(/3 semaines d/);
    expect(screen.getByText('Ton record : 5 semaines. Continue !')).toBeOnTheScreen();
    expect(screen.getByTestId('attendance-month')).toHaveTextContent('6/8 · 75 %');
    expect(screen.getByTestId('attendance-month-bar')).toBeOnTheScreen();
  });

  it('invite à démarrer une série quand elle est à zéro', () => {
    render(<AttendanceCard attendance={{ ...ATTENDANCE, currentStreakWeeks: 0 }} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByTestId('attendance-streak')).toHaveTextContent('Lance ta série');
  });
});

describe('StreakBadge (TLX-115)', () => {
  it('ne rend rien sans série en cours', () => {
    render(<StreakBadge weeks={0} />, { wrapper: Wrapper });
    expect(screen.queryByTestId('home-streak-badge')).toBeNull();
  });

  it('affiche le décompte de semaines au singulier/pluriel', () => {
    const { rerender } = render(<StreakBadge weeks={1} />, { wrapper: Wrapper });
    expect(screen.getByTestId('home-streak-badge')).toHaveTextContent(/1 semaine d/);
    rerender(<StreakBadge weeks={4} />);
    expect(screen.getByTestId('home-streak-badge')).toHaveTextContent(/4 semaines d/);
  });
});

describe('AttendanceSection (TLX-115)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rend la carte dès qu’une affectation est évaluable', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [{ id: 's1', status: 'completed', dueDate: daysAgo(0), athleteId: 'a-1' }] },
    });
    render(<AttendanceSection />, { wrapper: Wrapper });
    await waitFor(() => expect(screen.getByTestId('attendance-card')).toBeOnTheScreen());
    // Unique semaine active (en cours) entièrement réalisée → série de 1.
    expect(screen.getByTestId('attendance-streak')).toHaveTextContent("1 semaine d'affilée");
  });

  it('reste masquée sans aucune affectation évaluable', async () => {
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: { data: [{ id: 'f', status: 'assigned', dueDate: daysAgo(-30), athleteId: 'a-1' }] },
    });
    render(<AttendanceSection />, { wrapper: Wrapper });
    await waitFor(() => expect(mockListAssignments).toHaveBeenCalled());
    expect(screen.queryByTestId('attendance-card')).toBeNull();
  });
});
