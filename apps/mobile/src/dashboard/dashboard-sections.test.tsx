import { ThemeProvider, darkColors, darkTheme } from '@talent-x/design-tokens';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { type ReactNode, useState } from 'react';

// Les lignes « Aujourd'hui » rendent les actions coach (ADR-31) → useToast.
jest.mock('../feedback', () => ({ useToast: () => ({ show: jest.fn(), dismiss: jest.fn() }) }));

import {
  AlertsSection,
  AllClearCard,
  ToReviewSection,
  TodaySection,
  TrainingLoadSection,
  athletesMissingConsent,
  athletesToReview,
  athletesWithLoad,
  athletesWithLoadAlert,
  athletesWithOverdue,
  formatAcwr,
  gaugeFraction,
  isDueToday,
  selectTodayAssignments,
} from './dashboard-sections';

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

const NOW = new Date('2026-06-09T12:00:00.000Z');

function assignment(partial: Record<string, unknown>) {
  return { id: 'x', sessionId: 's', athleteId: 'a', status: 'assigned', ...partial } as never;
}

function athlete(partial: Record<string, unknown>) {
  return {
    id: 'a',
    firstName: 'A',
    lastName: 'B',
    status: 'pending_review',
    overdueCount: 0,
    toReviewCount: 0,
    ...partial,
  } as never;
}

describe('helpers de sections dashboard (TLX-082/083)', () => {
  it('isDueToday : vrai uniquement le jour courant (UTC)', () => {
    expect(isDueToday('2026-06-09T00:00:00.000Z', NOW)).toBe(true);
    expect(isDueToday('2026-06-09T23:59:00.000Z', NOW)).toBe(true);
    expect(isDueToday('2026-06-08T23:59:00.000Z', NOW)).toBe(false);
    expect(isDueToday('2026-06-10T00:00:00.000Z', NOW)).toBe(false);
    expect(isDueToday(undefined, NOW)).toBe(false);
    expect(isDueToday('pas-une-date', NOW)).toBe(false);
  });

  it('selectTodayAssignments : jour courant + statut à faire seulement', () => {
    const list = [
      assignment({ id: 'a1', status: 'assigned', dueDate: '2026-06-09T00:00:00.000Z' }),
      assignment({ id: 'a2', status: 'in_progress', dueDate: '2026-06-09T00:00:00.000Z' }),
      assignment({ id: 'a3', status: 'completed', dueDate: '2026-06-09T00:00:00.000Z' }), // réalisée → exclue
      assignment({ id: 'a4', status: 'assigned', dueDate: '2026-06-10T00:00:00.000Z' }), // demain → exclue
      assignment({ id: 'a5', status: 'assigned' }), // sans échéance → exclue
    ];
    expect(selectTodayAssignments(list, NOW).map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('athletesToReview : filtre toReviewCount>0, tri décroissant', () => {
    const list = [
      athlete({ id: 'x', toReviewCount: 1 }),
      athlete({ id: 'y', toReviewCount: 0 }),
      athlete({ id: 'z', toReviewCount: 3 }),
    ];
    expect(athletesToReview(list).map((a) => a.id)).toEqual(['z', 'x']);
  });

  it('athletesWithOverdue : filtre overdueCount>0, tri décroissant', () => {
    const list = [
      athlete({ id: 'x', overdueCount: 2 }),
      athlete({ id: 'y', overdueCount: 0 }),
      athlete({ id: 'z', overdueCount: 5 }),
    ];
    expect(athletesWithOverdue(list).map((a) => a.id)).toEqual(['z', 'x']);
  });

  it('athletesMissingConsent : seulement coachAccessGranted === false', () => {
    const list = [
      athlete({ id: 'x', coachAccessGranted: false }),
      athlete({ id: 'y', coachAccessGranted: true }),
      athlete({ id: 'z' }), // champ absent → non signalé
    ];
    expect(athletesMissingConsent(list).map((a) => a.id)).toEqual(['x']);
  });
});

describe('AlertsSection (TLX-084)', () => {
  it('résumé agrégé + lignes par athlète (retard, consentement), cliquables', () => {
    const onPress = jest.fn();
    render(
      <AlertsSection
        athletes={[
          athlete({
            id: 'a-1',
            firstName: 'Léa',
            lastName: 'Dubois',
            overdueCount: 2,
            coachAccessGranted: true,
          }),
          athlete({
            id: 'a-2',
            firstName: 'Tom',
            lastName: 'Bah',
            overdueCount: 0,
            coachAccessGranted: false,
          }),
        ]}
        onPressAthlete={onPress}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('coach-dashboard-alerts')).toHaveTextContent(/2 séances en retard/);
    expect(screen.getByTestId('coach-dashboard-alerts')).toHaveTextContent(
      /1 consentement d'accès manquant/,
    );
    expect(screen.getByTestId('coach-dashboard-alert-overdue-a-1')).toHaveTextContent(/Léa Dubois/);
    expect(screen.getByTestId('coach-dashboard-alert-overdue-a-1')).toHaveTextContent(
      /2 séances manquées/,
    );
    expect(screen.getByTestId('coach-dashboard-alert-consent-a-2')).toHaveTextContent(
      /Consentement d'accès manquant/,
    );
    fireEvent.press(screen.getByTestId('coach-dashboard-alert-consent-a-2'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-2' }));
  });

  it('rendue null sans signal', () => {
    render(
      <AlertsSection
        athletes={[athlete({ id: 'a-1', overdueCount: 0, coachAccessGranted: true })]}
        onPressAthlete={jest.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByTestId('coach-dashboard-alerts')).toBeNull();
  });
});

describe('AllClearCard (TLX-085)', () => {
  it('affiche l’état positif global', () => {
    render(<AllClearCard />, { wrapper: Wrapper });
    expect(screen.getByTestId('coach-dashboard-all-clear')).toHaveTextContent(/Tout est à jour/);
  });
});

describe('ToReviewSection (TLX-082)', () => {
  it('liste les athlètes à revoir, cliquables', () => {
    const onPress = jest.fn();
    render(
      <ToReviewSection
        athletes={[athlete({ id: 'a-1', firstName: 'Nina', lastName: 'Koné', toReviewCount: 2 })]}
        onPressAthlete={onPress}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('coach-dashboard-toreview-a-1')).toHaveTextContent(/Nina Koné/);
    expect(screen.getByTestId('coach-dashboard-toreview-a-1')).toHaveTextContent(
      /2 perfs à revoir/,
    );
    fireEvent.press(screen.getByTestId('coach-dashboard-toreview-a-1'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' }));
  });

  it('état positif « Rien à revoir » quand aucun', () => {
    render(
      <ToReviewSection
        athletes={[athlete({ id: 'a-1', toReviewCount: 0 })]}
        onPressAthlete={jest.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('coach-dashboard-toreview-empty')).toHaveTextContent(/Rien à revoir/);
    expect(screen.queryByTestId('coach-dashboard-toreview-a-1')).toBeNull();
  });
});

describe('TodaySection (TLX-083)', () => {
  const nameById = new Map([['a-1', 'Nina Koné']]);

  it('liste les affectations du jour avec leur statut', () => {
    render(
      <TodaySection
        assignments={[
          assignment({
            id: 'as-1',
            athleteId: 'a-1',
            status: 'assigned',
            session: { title: 'Fractionné' },
          }),
        ]}
        nameById={nameById}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('coach-dashboard-today-as-1')).toHaveTextContent(/Fractionné/);
    expect(screen.getByTestId('coach-dashboard-today-as-1')).toHaveTextContent(/Nina Koné/);
    expect(screen.getByTestId('assignment-status-assigned')).toHaveTextContent('À faire');
  });

  it('état vide « Rien de prévu » quand aucune affectation', () => {
    render(
      <TodaySection
        assignments={[]}
        nameById={nameById}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('coach-dashboard-today-empty')).toHaveTextContent(/Rien de prévu/);
  });

  it('état erreur cliquable pour réessayer', () => {
    const onRetry = jest.fn();
    render(
      <TodaySection
        assignments={[]}
        nameById={nameById}
        isLoading={false}
        isError
        onRetry={onRetry}
      />,
      { wrapper: Wrapper },
    );
    fireEvent.press(screen.getByTestId('coach-dashboard-today-error'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('état chargement', () => {
    render(
      <TodaySection
        assignments={[]}
        nameById={nameById}
        isLoading
        isError={false}
        onRetry={jest.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('coach-dashboard-today-loading')).toBeOnTheScreen();
  });
});

describe('Charge d’entraînement (TLX-113)', () => {
  const withLoad = (id: string, zone: string, over: Record<string, unknown> = {}) =>
    athlete({ id, load: { acute: 100, chronic: 90, zone, weeklyLoad: 100, sessions: 5, ...over } });

  it('athletesWithLoad : filtre ≥1 séance, tri alerte (surcharge/sous-charge) d’abord', () => {
    const list = [
      withLoad('opt', 'optimal', { acwr: 1.0 }),
      withLoad('over', 'overload', { acwr: 1.8 }),
      withLoad('none', 'insufficient', { sessions: 0 }), // pas de séance → exclu
      withLoad('under', 'underload', { acwr: 0.5 }),
    ];
    expect(athletesWithLoad(list).map((a) => a.id)).toEqual(['over', 'under', 'opt']);
  });

  it('athletesWithLoadAlert : seulement surcharge/sous-charge', () => {
    const list = [withLoad('o', 'optimal'), withLoad('s', 'overload'), withLoad('u', 'underload')];
    expect(
      athletesWithLoadAlert(list)
        .map((a) => a.id)
        .sort(),
    ).toEqual(['s', 'u']);
  });

  it('un athlète sans historique suffisant n’est jamais en alerte (TLX-260)', () => {
    // Le défaut de QA-02.6 : « Surcharge » en rouge sur tout athlète de moins d'une semaine
    // d'ancienneté, par construction arithmétique — l'alerte cessait d'être un signal.
    const list = [withLoad('neuf', 'insufficient'), withLoad('over', 'overload', { acwr: 1.8 })];

    expect(athletesWithLoadAlert(list).map((a) => a.id)).toEqual(['over']);
    // Il reste listé dans la section : sa charge est mesurée, c'est le **ratio** qui manque.
    expect(athletesWithLoad(list).map((a) => a.id)).toContain('neuf');
  });

  it('formatAcwr / gaugeFraction', () => {
    expect(formatAcwr(1.234)).toBe('1.23');
    expect(formatAcwr(undefined)).toBe('—');
    expect(gaugeFraction(1.0)).toBe(0.5);
    expect(gaugeFraction(3)).toBe(1); // borné à 1
    expect(gaugeFraction(undefined)).toBe(0);
  });

  it('TrainingLoadSection : jauge + zone par athlète, surcharge en tête, cliquable', () => {
    const onPress = jest.fn();
    render(
      <TrainingLoadSection
        athletes={[
          withLoad('a-1', 'optimal', { acwr: 1.1 }),
          withLoad('a-2', 'overload', { acwr: 1.7 }),
        ]}
        onPressAthlete={onPress}
      />,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('coach-dashboard-load-a-2-zone')).toHaveTextContent(/Surcharge/);
    expect(screen.getByTestId('coach-dashboard-load-a-1-zone')).toHaveTextContent(/Optimal/);
    expect(screen.getByTestId('coach-dashboard-load-a-2')).toHaveTextContent(/ACWR 1.70/);
    fireEvent.press(screen.getByTestId('coach-dashboard-load-a-2'));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-2' }));
  });

  it('TrainingLoadSection : rendue null sans lecture de charge', () => {
    const { toJSON } = render(
      <TrainingLoadSection athletes={[athlete({ id: 'x' })]} onPressAthlete={jest.fn()} />,
      { wrapper: Wrapper },
    );
    expect(toJSON()).toBeNull();
  });
});

describe('contraste AA des textes secondaires (TLX-145)', () => {
  /** Couleur résolue d'un nœud Text (style possiblement composé). */
  const colorOf = (node: { props: { style?: unknown } }): string | undefined =>
    (StyleSheet.flatten(node.props.style) as { color?: string }).color;

  it('ToReviewSection : le détail « N perfs à revoir » est en textSecondary (pas textMuted)', () => {
    render(
      <ToReviewSection
        athletes={[athlete({ id: 'a-1', toReviewCount: 2 })]}
        onPressAthlete={jest.fn()}
      />,
      { wrapper: DarkWrapper },
    );
    const card = screen.getByTestId('coach-dashboard-toreview-a-1');
    expect(colorOf(within(card).getByText(/perfs? à revoir/))).toBe(darkColors.textSecondary);
  });

  it('AlertsSection : le détail d’alerte par athlète est en textSecondary', () => {
    render(
      <AlertsSection
        athletes={[
          athlete({
            id: 'a-1',
            firstName: 'Léa',
            lastName: 'Dubois',
            overdueCount: 2,
            coachAccessGranted: true,
          }),
        ]}
        onPressAthlete={jest.fn()}
      />,
      { wrapper: DarkWrapper },
    );
    const row = screen.getByTestId('coach-dashboard-alert-overdue-a-1');
    expect(colorOf(within(row).getByText(/séances? manquées?/))).toBe(darkColors.textSecondary);
  });

  it('TodaySection : état vide et nom d’athlète sont en textSecondary', () => {
    const nameById = new Map([['a-1', 'Nina Koné']]);
    const { rerender } = render(
      <TodaySection
        assignments={[]}
        nameById={nameById}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
      />,
      { wrapper: DarkWrapper },
    );
    expect(
      colorOf(within(screen.getByTestId('coach-dashboard-today-empty')).getByText(/Rien de prévu/)),
    ).toBe(darkColors.textSecondary);

    rerender(
      <TodaySection
        assignments={[
          assignment({
            id: 'as-1',
            athleteId: 'a-1',
            status: 'assigned',
            session: { title: 'Fractionné' },
          }),
        ]}
        nameById={nameById}
        isLoading={false}
        isError={false}
        onRetry={jest.fn()}
      />,
    );
    expect(
      colorOf(within(screen.getByTestId('coach-dashboard-today-as-1')).getByText('Nina Koné')),
    ).toBe(darkColors.textSecondary);
  });

  /**
   * TLX-260 — l'historique insuffisant n'est pas une zone. Ce test portait le sujet a11y
   * (TLX-145/151 : le libellé du **badge neutre** doit rester lisible en thème sombre) ; ce badge
   * n'existe plus, la ligne de lecture le remplace et hérite du sujet.
   */
  it('TrainingLoadSection : historique insuffisant → pas de badge ni de jauge, ligne lisible (TLX-260)', () => {
    const withoutHistory = athlete({
      id: 'a-1',
      // Forme réellement produite par l'API depuis TLX-260 : pas de zone ⇒ pas d'ACWR.
      load: { acute: 100, chronic: 25, zone: 'insufficient', weeklyLoad: 100, sessions: 5 },
    });
    render(<TrainingLoadSection athletes={[withoutHistory]} onPressAthlete={jest.fn()} />, {
      wrapper: DarkWrapper,
    });

    // Ni verdict de zone, ni jauge : une jauge à zéro se lirait comme une charge nulle.
    expect(screen.queryByTestId('coach-dashboard-load-a-1-zone')).toBeNull();
    expect(screen.queryByTestId('coach-dashboard-load-a-1-gauge')).toBeNull();
    // Le libellé dit la cause, et la charge mesurée reste affichée — elle, elle est vraie.
    const card = screen.getByTestId('coach-dashboard-load-a-1');
    const line = within(card).getByText(/Pas assez d'historique/);
    expect(line).toHaveTextContent(/charge aiguë 100/);
    expect(colorOf(line)).toBe(darkColors.textSecondary);
  });
});
