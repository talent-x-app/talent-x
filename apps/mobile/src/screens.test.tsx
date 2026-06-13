import { type ReactNode } from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';

jest.mock('expo-router', () => ({ Redirect: () => null, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
// L'accueil coach rend désormais le tableau de bord (C-01, TLX-081) — couvert en
// détail par CoachDashboardScreen.test.tsx ; ici on évite l'appel réseau réel.
jest.mock('@talent-x/api-client', () => ({
  getCoachDashboard: () => new Promise(() => {}),
  listAssignments: () => new Promise(() => {}),
  getMe: () => new Promise(() => {}),
  getMyGroups: () => new Promise(() => {}),
  // Cloche notifications (TLX-92) rendue dans l'en-tête d'accueil — feed jamais résolu ici.
  listNotifications: () => new Promise(() => {}),
  updateAssignment: jest.fn(),
  deleteAssignment: jest.fn(),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
  AssignmentStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    completed: 'completed',
    skipped: 'skipped',
  },
  AssignmentUpdateRequestStatus: {
    assigned: 'assigned',
    in_progress: 'in_progress',
    skipped: 'skipped',
  },
  SkipReason: { injury: 'injury', absence: 'absence', weather: 'weather', other: 'other' },
}));
// La cloche notifications (TLX-92) lit la session ; pas de SessionProvider dans ce smoke test.
jest.mock('./auth/SessionProvider', () => ({
  useSession: () => ({ role: 'athlete', isLoading: false, signIn: jest.fn(), signOut: jest.fn() }),
}));

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CoachHomeScreen from '../app/(coach)/index';
import AthleteHomeScreen from '../app/(athlete)/index';

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

describe('CoachHomeScreen (TLX-081)', () => {
  it('rend le tableau de bord coach (état de chargement)', () => {
    render(<CoachHomeScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('coach-dashboard-loading')).toBeOnTheScreen();
  });
});

describe('AthleteHomeScreen (A-01, TLX-089)', () => {
  it('rend l’accueil athlète (salutation + chargement) — détail couvert par AthleteHomeScreen.test', () => {
    render(<AthleteHomeScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('home-greeting')).toBeOnTheScreen();
    expect(screen.getByTestId('home-loading')).toBeOnTheScreen();
  });
});
