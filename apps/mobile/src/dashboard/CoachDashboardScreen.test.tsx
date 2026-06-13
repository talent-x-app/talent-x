import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { type ReactNode, useState } from 'react';

const mockGetCoachDashboard = jest.fn();
const mockListAssignments = jest.fn();
const mockListNotifications = jest.fn();
const mockPush = jest.fn();
// Dimensions de fenêtre contrôlables (TLX-123) — mutées par les tests responsive.
const mockWindow = { width: 375, height: 812, scale: 2, fontScale: 1 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

jest.mock('@talent-x/api-client', () => ({
  getCoachDashboard: (...args: unknown[]) => mockGetCoachDashboard(...args),
  listAssignments: (...args: unknown[]) => mockListAssignments(...args),
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  updateAssignment: jest.fn(),
  deleteAssignment: jest.fn(),
  // Enums orval réexportés tels quels (valeurs littérales).
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
// Les lignes « Aujourd'hui » rendent les actions coach (ADR-31) → useToast.
jest.mock('../feedback', () => ({ useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }) }));
// Cloche notifications (TLX-92) rendue dans l'en-tête → useSession.
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ role: 'coach', isLoading: false, signIn: jest.fn(), signOut: jest.fn() }),
}));

import { CoachDashboardScreen } from './CoachDashboardScreen';

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
  athletes: [
    {
      id: 'a-1',
      firstName: 'Léa',
      lastName: 'Dubois',
      sport: '200m',
      status: 'late',
      overdueCount: 1,
      toReviewCount: 0,
      coachAccessGranted: false,
    },
    {
      id: 'a-2',
      firstName: 'Tom',
      lastName: 'Petit',
      sport: undefined,
      status: 'pending_review',
      overdueCount: 0,
      toReviewCount: 1,
      coachAccessGranted: true,
    },
  ],
  summary: {
    athleteCount: 2,
    toReview: 1,
    today: 0,
    alerts: { missedSessions: 1, consentMissing: 1 },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  // Par défaut : pas d'affectation (les tests qui ciblent « Aujourd'hui » surchargent).
  mockListAssignments.mockResolvedValue({ status: 200, data: { data: [], meta: {} } });
  mockListNotifications.mockResolvedValue({
    status: 200,
    data: { data: [], unreadCount: 0, meta: { total: 0, page: 1, limit: 50 } },
  });
});

describe('CoachDashboardScreen (TLX-081)', () => {
  it('affiche le spinner pendant le chargement', () => {
    mockGetCoachDashboard.mockReturnValue(new Promise(() => {}));
    render(<CoachDashboardScreen />, { wrapper: Wrapper });
    expect(screen.getByTestId('coach-dashboard-loading')).toBeOnTheScreen();
  });

  it('affiche la cloche de notifications avec badge et ouvre le centre coach (TLX-92)', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    mockListNotifications.mockResolvedValue({
      status: 200,
      data: { data: [], unreadCount: 2, meta: { total: 0, page: 1, limit: 50 } },
    });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('notifications-bell')).toBeOnTheScreen());
    await waitFor(() =>
      expect(screen.getByTestId('notifications-bell-badge')).toHaveTextContent('2'),
    );
    fireEvent.press(screen.getByTestId('notifications-bell'));
    expect(mockPush).toHaveBeenCalledWith('/(coach)/notifications');
  });

  it('charge puis affiche KPIs, athlètes et leurs statuts', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-kpi-toreview')).toBeOnTheScreen(),
    );
    // KPI « À revoir » = 1, « Aujourd'hui » = 0 (valeur ciblée par testID dédié)
    expect(screen.getByTestId('coach-dashboard-kpi-toreview-value')).toHaveTextContent('1');
    expect(screen.getByTestId('coach-dashboard-kpi-today-value')).toHaveTextContent('0');
    // Sous-titre : nombre d'athlètes
    expect(screen.getByTestId('coach-dashboard-subtitle')).toHaveTextContent('2 athlètes suivis');
    // Athlètes + statuts (chacun peut aussi apparaître dans Alertes / À revoir → getAllByText).
    expect(screen.getAllByText('Léa Dubois').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Tom Petit').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('status-badge-late')).toHaveTextContent('En retard');
    expect(screen.getByTestId('status-badge-pending_review')).toHaveTextContent('À revoir');
  });

  it('affiche les sections « À revoir » et « Aujourd’hui » (TLX-082/083)', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    // Une affectation à échéance aujourd'hui (UTC) pour l'athlète a-1, statut « assigned ».
    const today = new Date();
    const todayIso = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    ).toISOString();
    mockListAssignments.mockResolvedValue({
      status: 200,
      data: {
        data: [
          {
            id: 'as-1',
            sessionId: 's-1',
            athleteId: 'a-1',
            status: 'assigned',
            dueDate: todayIso,
            session: { id: 's-1', title: 'Fractionné', status: 'published', coachId: 'c-1' },
          },
        ],
        meta: {},
      },
    });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    // « À revoir » : Tom Petit a toReviewCount 1 → ligne cliquable.
    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-toreview-a-2')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('coach-dashboard-toreview-a-2')).toHaveTextContent(/Tom Petit/);
    expect(screen.getByTestId('coach-dashboard-toreview-a-2')).toHaveTextContent(/1 perf à revoir/);

    // « Aujourd'hui » : l'affectation du jour de Léa apparaît avec son statut.
    await waitFor(() => expect(screen.getByTestId('coach-dashboard-today-as-1')).toBeOnTheScreen());
    expect(screen.getByTestId('coach-dashboard-today-as-1')).toHaveTextContent(/Fractionné/);
    expect(screen.getByTestId('coach-dashboard-today-as-1')).toHaveTextContent(/Léa Dubois/);
  });

  it('alertes détaillées par athlète, cliquables vers le détail (TLX-084)', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    // Léa : 1 séance manquée + consentement d'accès manquant → deux lignes dédiées.
    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-alert-overdue-a-1')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('coach-dashboard-alert-overdue-a-1')).toHaveTextContent(/Léa Dubois/);
    expect(screen.getByTestId('coach-dashboard-alert-overdue-a-1')).toHaveTextContent(
      /1 séance manquée/,
    );
    expect(screen.getByTestId('coach-dashboard-alert-consent-a-1')).toHaveTextContent(
      /Consentement d'accès manquant/,
    );

    fireEvent.press(screen.getByTestId('coach-dashboard-alert-overdue-a-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/athlete/[id]',
        params: expect.objectContaining({ id: 'a-1' }),
      }),
    );
  });

  it('« Tout est à jour » remplace les sections quand aucun signal (TLX-085)', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: {
        athletes: [
          { ...DASHBOARD.athletes[1], status: 'up_to_date', toReviewCount: 0, overdueCount: 0 },
        ],
        summary: {
          athleteCount: 1,
          toReview: 0,
          today: 0,
          alerts: { missedSessions: 0, consentMissing: 0 },
        },
      },
    });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-dashboard-all-clear')).toBeOnTheScreen());
    expect(screen.getByTestId('coach-dashboard-all-clear')).toHaveTextContent(/Tout est à jour/);
    // Les sections (et leurs états vides) sont remplacées par l'état global.
    expect(screen.queryByTestId('coach-dashboard-toreview-empty')).toBeNull();
    expect(screen.queryByTestId('coach-dashboard-today-empty')).toBeNull();
    expect(screen.queryByTestId('coach-dashboard-alerts')).toBeNull();
  });

  it('états positif/vide des sections quand rien à revoir ni prévu', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: {
        athletes: [
          { ...DASHBOARD.athletes[0], status: 'up_to_date', overdueCount: 0, toReviewCount: 0 },
        ],
        summary: {
          athleteCount: 1,
          toReview: 0,
          today: 0,
          alerts: { missedSessions: 0, consentMissing: 0 },
        },
      },
    });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-toreview-empty')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('coach-dashboard-toreview-empty')).toHaveTextContent(/Rien à revoir/);
    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-today-empty')).toBeOnTheScreen(),
    );
    expect(screen.getByTestId('coach-dashboard-today-empty')).toHaveTextContent(/Rien de prévu/);
  });

  it('ouvre le détail athlète au tap sur une carte', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-athlete-a-1')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId('coach-dashboard-athlete-a-1'));
    expect(mockPush).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/(coach)/athlete/[id]',
        params: expect.objectContaining({ id: 'a-1', status: 'late' }),
      }),
    );
  });

  it('ouvre le constructeur de séance (C-05) au tap sur « Nouvelle séance »', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-new-session')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByTestId('coach-dashboard-new-session'));
    expect(mockPush).toHaveBeenCalledWith('/(coach)/session/new');
  });

  it('affiche le bandeau d’alertes quand retards ou consentements manquants', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-dashboard-alerts')).toBeOnTheScreen());
    // Bandeau concaténé → match partiel via regex.
    expect(screen.getByTestId('coach-dashboard-alerts')).toHaveTextContent(/1 séance en retard/);
    expect(screen.getByTestId('coach-dashboard-alerts')).toHaveTextContent(
      /1 consentement d'accès manquant/,
    );
  });

  it('masque le bandeau d’alertes quand aucun signal', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: {
        athletes: [{ ...DASHBOARD.athletes[1], status: 'up_to_date', toReviewCount: 0 }],
        summary: {
          athleteCount: 1,
          toReview: 0,
          today: 0,
          alerts: { missedSessions: 0, consentMissing: 0 },
        },
      },
    });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByText('Tom Petit')).toBeOnTheScreen());
    expect(screen.queryByTestId('coach-dashboard-alerts')).toBeNull();
    expect(screen.getByTestId('status-badge-up_to_date')).toHaveTextContent('À jour');
  });

  it('état vide quand aucun athlète lié', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: {
        athletes: [],
        summary: {
          athleteCount: 0,
          toReview: 0,
          today: 0,
          alerts: { missedSessions: 0, consentMissing: 0 },
        },
      },
    });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-dashboard-empty')).toBeOnTheScreen());
    expect(screen.getByTestId('coach-dashboard-subtitle')).toHaveTextContent('0 athlète suivi');
    // Première utilisation (TLX-085) : carte d'accueil enrichie.
    expect(screen.getByTestId('coach-dashboard-empty')).toHaveTextContent(/Bienvenue/);
    expect(screen.queryByTestId('coach-dashboard-all-clear')).toBeNull();
  });

  it('état erreur : message + réessai relance la requête', async () => {
    mockGetCoachDashboard.mockResolvedValueOnce({ status: 500, data: { error: 'INTERNAL_ERROR' } });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTestId('coach-dashboard-error')).toBeOnTheScreen());

    mockGetCoachDashboard.mockResolvedValueOnce({ status: 200, data: DASHBOARD });
    fireEvent.press(screen.getByTestId('coach-dashboard-retry'));
    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-kpi-toreview')).toBeOnTheScreen(),
    );
  });

  // Layout adaptatif web/tablette (TLX-123) : le contenu coach est borné et centré au-delà du
  // seuil tablette, pleine largeur sur téléphone.
  describe('layout adaptatif (TLX-123)', () => {
    afterEach(() => {
      mockWindow.width = 375;
    });

    function contentMaxWidth(): number | undefined {
      const flat = StyleSheet.flatten(
        screen.getByTestId('coach-responsive-content').props.style,
      ) as { maxWidth?: number };
      return flat.maxWidth;
    }

    it('borne la largeur du contenu sur grand écran (desktop)', async () => {
      mockWindow.width = 1280;
      mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
      render(<CoachDashboardScreen />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByTestId('coach-responsive-content')).toBeOnTheScreen());
      expect(contentMaxWidth()).toBe(960);
    });

    it('pleine largeur sur téléphone (aucune borne)', async () => {
      mockWindow.width = 375;
      mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
      render(<CoachDashboardScreen />, { wrapper: Wrapper });
      await waitFor(() => expect(screen.getByTestId('coach-responsive-content')).toBeOnTheScreen());
      expect(contentMaxWidth()).toBeUndefined();
    });
  });
});
