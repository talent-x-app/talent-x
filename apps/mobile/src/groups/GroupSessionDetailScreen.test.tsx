import { type ReactNode, useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetAssignment = jest.fn();
const mockBack = jest.fn();

jest.mock('@talent-x/api-client', () => {
  const actual = jest.requireActual('@talent-x/api-client');
  return { ...actual, getAssignment: (...a: unknown[]) => mockGetAssignment(...a) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: '' }),
}));

import { GroupSessionDetailScreen } from './GroupSessionDetailScreen';

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

const ASSIGNMENT = {
  status: 200,
  data: {
    id: 'asg-1',
    sessionId: 's-1',
    athleteId: 'a',
    status: 'assigned',
    dueDate: '2026-06-21',
    session: {
      id: 's-1',
      title: 'Test 150 m chrono',
      status: 'published',
      coachId: 'c',
      brief: { athleteIntent: 'Valider la vitesse max' },
      exercises: {
        schemaVersion: 3,
        items: [{ name: 'Sprint 150 m', type: 'sprint', order: 0, params: {} }],
      },
    },
  },
};

beforeEach(() => {
  mockGetAssignment.mockReset();
  mockBack.mockReset();
});

describe('GroupSessionDetailScreen (ADR-43, Phase A lecture seule)', () => {
  it('affiche titre, discipline dérivée et déroulé', async () => {
    mockGetAssignment.mockResolvedValue(ASSIGNMENT);
    render(
      <Wrapper>
        <GroupSessionDetailScreen assignmentId="asg-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('group-session-title')).toBeOnTheScreen());
    expect(screen.getByTestId('group-session-title')).toHaveTextContent('Test 150 m chrono');
    expect(screen.getByTestId('group-session-disc')).toHaveTextContent(/Sprint/);
    expect(screen.getByTestId('group-session-perf')).toBeOnTheScreen();
    expect(screen.getByText('Sprint 150 m')).toBeOnTheScreen();
    // Présence (ADR-43 §1, Phase B) : contrôle rendu pour une séance exécutable.
    expect(screen.getByTestId('presence-control')).toBeOnTheScreen();
  });

  it('état erreur + réessai', async () => {
    mockGetAssignment.mockResolvedValue({ status: 404 });
    render(
      <Wrapper>
        <GroupSessionDetailScreen assignmentId="asg-1" />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByTestId('group-session-error')).toBeOnTheScreen());
    mockGetAssignment.mockResolvedValue(ASSIGNMENT);
    fireEvent.press(screen.getByTestId('group-session-error-retry'));
    await waitFor(() => expect(screen.getByTestId('group-session-title')).toBeOnTheScreen());
  });
});
