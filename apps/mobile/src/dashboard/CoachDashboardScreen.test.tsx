import { ThemeProvider, darkColors, darkTheme } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';
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

/** Variante forçant le thème **sombre** (dark-first) — pour les assertions de contraste (TLX-145). */
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

  it('rend le texte secondaire de l’accueil coach en textSecondary — contraste AA (TLX-145)', async () => {
    mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
    render(<CoachDashboardScreen />, { wrapper: DarkWrapper });
    const colorOf = (node: { props: { style?: unknown } }): string | undefined =>
      (StyleSheet.flatten(node.props.style) as { color?: string }).color;

    await waitFor(() => expect(screen.getByTestId('coach-dashboard-subtitle')).toBeOnTheScreen());
    // Sous-titre « N athlètes suivis »
    expect(colorOf(screen.getByTestId('coach-dashboard-subtitle'))).toBe(darkColors.textSecondary);
    // Libellé KPI « À revoir » (unique dans la carte KPI)
    const kpi = screen.getByTestId('coach-dashboard-kpi-toreview');
    expect(colorOf(within(kpi).getByText('À revoir'))).toBe(darkColors.textSecondary);
    // Sous-titre de la ligne-athlète (discipline) dans le roster
    const row = screen.getByTestId('coach-dashboard-athlete-a-1');
    expect(colorOf(within(row).getByText('200m'))).toBe(darkColors.textSecondary);
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

  // KPI actionnables (TLX-146) : taper « À revoir » / « Aujourd'hui » défile vers la section
  // correspondante ; carte inerte (ni rôle bouton, ni scroll) quand la valeur vaut 0.
  describe('KPI actionnables (TLX-146)', () => {
    /** Renvoie l'offset Y simulé pour une ancre de section après son `onLayout`. */
    function fireAnchorLayout(testID: string, y: number): void {
      fireEvent(screen.getByTestId(testID), 'layout', {
        nativeEvent: { layout: { x: 0, y, width: 300, height: 120 } },
      });
    }

    it('taper « À revoir » (>0) expose un bouton a11y et défile vers la section', async () => {
      const scrollSpy = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => undefined);
      try {
        mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
        render(<CoachDashboardScreen />, { wrapper: Wrapper });

        await waitFor(() =>
          expect(screen.getByTestId('coach-dashboard-toreview-anchor')).toBeOnTheScreen(),
        );
        // La section a été mesurée (offset capté par onLayout).
        fireAnchorLayout('coach-dashboard-toreview-anchor', 300);

        const kpi = screen.getByTestId('coach-dashboard-kpi-toreview');
        // Actionnable → rôle bouton + label a11y (seulement quand value > 0).
        expect(kpi.props.accessibilityRole).toBe('button');
        expect(kpi.props.accessibilityLabel).toBe('À revoir : 1, voir la liste');

        fireEvent.press(kpi);
        expect(scrollSpy).toHaveBeenCalledWith({ y: 300, animated: true });
      } finally {
        scrollSpy.mockRestore();
      }
    });

    it('taper « Aujourd’hui » (>0) défile vers la section « Aujourd’hui »', async () => {
      const scrollSpy = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => undefined);
      try {
        mockGetCoachDashboard.mockResolvedValue({
          status: 200,
          data: { ...DASHBOARD, summary: { ...DASHBOARD.summary, today: 2 } },
        });
        render(<CoachDashboardScreen />, { wrapper: Wrapper });

        await waitFor(() =>
          expect(screen.getByTestId('coach-dashboard-today-anchor')).toBeOnTheScreen(),
        );
        fireAnchorLayout('coach-dashboard-today-anchor', 540);

        const kpi = screen.getByTestId('coach-dashboard-kpi-today');
        expect(kpi.props.accessibilityRole).toBe('button');
        expect(kpi.props.accessibilityLabel).toBe("Aujourd'hui : 2, voir la section");

        fireEvent.press(kpi);
        expect(scrollSpy).toHaveBeenCalledWith({ y: 540, animated: true });
      } finally {
        scrollSpy.mockRestore();
      }
    });

    it('KPI à 0 : carte inerte (ni rôle bouton, ni scroll au tap)', async () => {
      const scrollSpy = jest
        .spyOn(ScrollView.prototype, 'scrollTo')
        .mockImplementation(() => undefined);
      try {
        // « Tout est à jour » : toReview = 0 et today = 0 → cartes non actionnables.
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

        await waitFor(() =>
          expect(screen.getByTestId('coach-dashboard-kpi-toreview')).toBeOnTheScreen(),
        );
        const toReview = screen.getByTestId('coach-dashboard-kpi-toreview');
        const today = screen.getByTestId('coach-dashboard-kpi-today');
        // Non actionnables : aucun rôle bouton ni label a11y.
        expect(toReview.props.accessibilityRole).toBeUndefined();
        expect(toReview.props.accessibilityLabel).toBeUndefined();
        expect(today.props.accessibilityRole).toBeUndefined();
        // Le compteur reste affiché (non-régression).
        expect(screen.getByTestId('coach-dashboard-kpi-toreview-value')).toHaveTextContent('0');

        fireEvent.press(toReview);
        fireEvent.press(today);
        expect(scrollSpy).not.toHaveBeenCalled();
      } finally {
        scrollSpy.mockRestore();
      }
    });
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

  it('« Tes athlètes » est trié par statut puis nom (TLX-147)', async () => {
    mockGetCoachDashboard.mockResolvedValue({
      status: 200,
      data: {
        // Volontairement dans le désordre (ni par statut, ni alphabétique).
        athletes: [
          {
            id: 'ok',
            firstName: 'Anna',
            lastName: 'Zo',
            status: 'up_to_date',
            overdueCount: 0,
            toReviewCount: 0,
            coachAccessGranted: true,
          },
          {
            id: 'late-bilal',
            firstName: 'Bilal',
            lastName: 'Ka',
            status: 'late',
            overdueCount: 1,
            toReviewCount: 0,
            coachAccessGranted: true,
          },
          {
            id: 'rev',
            firstName: 'Chloé',
            lastName: 'Me',
            status: 'pending_review',
            overdueCount: 0,
            toReviewCount: 1,
            coachAccessGranted: true,
          },
          {
            id: 'late-adam',
            firstName: 'Adam',
            lastName: 'Be',
            status: 'late',
            overdueCount: 1,
            toReviewCount: 0,
            coachAccessGranted: true,
          },
        ],
        summary: {
          athleteCount: 4,
          toReview: 1,
          today: 0,
          alerts: { missedSessions: 2, consentMissing: 0 },
        },
      },
    });
    render(<CoachDashboardScreen />, { wrapper: Wrapper });

    await waitFor(() =>
      expect(screen.getByTestId('coach-dashboard-athlete-late-adam')).toBeOnTheScreen(),
    );
    const order = screen
      .getAllByTestId(/^coach-dashboard-athlete-/)
      .map((node) => node.props.testID);
    // late (Adam < Bilal) → pending_review → up_to_date
    expect(order).toEqual([
      'coach-dashboard-athlete-late-adam',
      'coach-dashboard-athlete-late-bilal',
      'coach-dashboard-athlete-rev',
      'coach-dashboard-athlete-ok',
    ]);
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
