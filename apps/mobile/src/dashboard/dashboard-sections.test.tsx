import { ThemeProvider } from '@talent-x/design-tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';

import {
  AlertsSection,
  AllClearCard,
  ToReviewSection,
  TodaySection,
  athletesMissingConsent,
  athletesToReview,
  athletesWithOverdue,
  isDueToday,
  selectTodayAssignments,
} from './dashboard-sections';

function Wrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
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
