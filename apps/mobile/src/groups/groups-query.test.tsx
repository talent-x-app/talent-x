import { ThemeProvider } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, Text } from 'react-native';

const mockListGroups = jest.fn();
const mockCreateGroup = jest.fn();
const mockGetCoachDashboard = jest.fn();
const mockAssignSession = jest.fn();

jest.mock('@talent-x/api-client', () => ({
  listGroups: (...a: unknown[]) => mockListGroups(...a),
  createGroup: (...a: unknown[]) => mockCreateGroup(...a),
  getCoachDashboard: (...a: unknown[]) => mockGetCoachDashboard(...a),
  assignSession: (...a: unknown[]) => mockAssignSession(...a),
  AthleteStatus: { up_to_date: 'up_to_date', late: 'late', pending_review: 'pending_review' },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('../feedback', () => ({
  useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }),
  toUserMessage: () => ({ title: 'Erreur', description: undefined }),
}));

import { CoachAssignScreen } from '../coach/CoachAssignScreen';
import { CoachGroupsScreen } from './CoachGroupsScreen';

/** Forme réelle de `GET /groups`, vérifiée sur le staging : enveloppe `{ data, meta }`. */
const GROUPS_PAGE = {
  data: [
    { id: 'g-1', coachId: 'me', name: 'Sprint élite', memberCount: 5 },
    { id: 'g-2', coachId: 'me', name: 'Demi-fond', memberCount: 3 },
  ],
  meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
};

const DASHBOARD = {
  summary: {
    athleteCount: 1,
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
  ],
};

const NOW = new Date('2026-06-15T00:00:00');

/** Un seul `QueryClient` pour tout l'arbre — comme dans l'app, où il est fourni à la racine. */
function SharedClient({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListGroups.mockResolvedValue({ status: 200, data: GROUPS_PAGE });
  mockGetCoachDashboard.mockResolvedValue({ status: 200, data: DASHBOARD });
});

/**
 * TLX-238 — `['groups']` avait **deux producteurs** écrivant des formes incompatibles :
 * `CoachGroupsScreen` le `Group[]` déballé, `CoachAssignScreen` l'enveloppe `{ data, meta }`.
 *
 * Aucun test existant ne pouvait le voir : ils montent **un écran à la fois**, chacun avec un
 * `QueryClient` neuf. La collision n'existe que lorsque deux écrans partagent un client
 * vivant — c'est-à-dire dans l'app réelle, jamais en test. TypeScript ne pouvait pas
 * davantage : chaque `useQuery` déclarait son propre type de retour pour la même clé, les
 * deux annotations étant localement cohérentes et mutuellement contradictoires.
 *
 * D'où ces tests : **deux écrans, un seul client**.
 */
describe("cache des groupes — producteur unique de `['groups']` (TLX-238)", () => {
  it('les deux écrans montés sur le même client lisent tous les deux leurs groupes', async () => {
    render(
      <SharedClient>
        <CoachGroupsScreen />
        <CoachAssignScreen sessionId="s-1" now={NOW} />
      </SharedClient>,
    );

    // Liste des groupes : plante en `groups.map is not a function` si le cache contient
    // l'enveloppe au lieu du tableau.
    await waitFor(() => expect(screen.getByTestId('group-item-g-1')).toBeOnTheScreen());
    // Affectation : tombe en liste vide **silencieuse** (`array.data` → `undefined` → `?? []`)
    // si le cache contient le tableau au lieu de l'enveloppe.
    await waitFor(() => expect(screen.getByTestId('assign-group-g-1')).toBeOnTheScreen());
    expect(screen.getByTestId('assign-group-g-2')).toBeOnTheScreen();
  });

  it('l’écran d’affectation qui monte après la liste ne casse pas la liste restée montée', async () => {
    // Reproduit le chemin de QA-02.2 : le coach passe par « Groupes » (l'écran est un
    // `Tabs.Screen … href: null`, donc **jamais démonté**), construit sa séance, puis
    // `router.replace` vers l'affectation — dont la `queryFn` écrasait `['groups']`.
    function Sequence() {
      const [assigning, setAssigning] = useState(false);
      return (
        <>
          <Pressable testID="go-assign" onPress={() => setAssigning(true)}>
            <Text>Enregistrer</Text>
          </Pressable>
          <CoachGroupsScreen />
          {assigning ? <CoachAssignScreen sessionId="s-1" now={NOW} /> : null}
        </>
      );
    }

    render(
      <SharedClient>
        <Sequence />
      </SharedClient>,
    );
    await waitFor(() => expect(screen.getByTestId('group-item-g-1')).toBeOnTheScreen());

    fireEvent.press(screen.getByTestId('go-assign'));

    await waitFor(() => expect(screen.getByTestId('assign-group-g-1')).toBeOnTheScreen());
    // La liste, toujours abonnée à `['groups']`, doit survivre à l'arrivée de l'autre écran.
    expect(screen.getByTestId('group-item-g-1')).toBeOnTheScreen();
  });

  it('un seul appel réseau pour les deux écrans — même clé, même `queryFn`', async () => {
    render(
      <SharedClient>
        <CoachGroupsScreen />
        <CoachAssignScreen sessionId="s-1" now={NOW} />
      </SharedClient>,
    );

    await waitFor(() => expect(screen.getByTestId('assign-group-g-1')).toBeOnTheScreen());
    expect(mockListGroups).toHaveBeenCalledTimes(1);
  });
});
