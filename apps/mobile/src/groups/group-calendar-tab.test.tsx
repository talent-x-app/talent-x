import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import type { Assignment } from '@talent-x/api-client';
import { GroupCalendarTab } from './group-calendar-tab';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;
const NOW = new Date(2026, 5, 21); // dimanche 21 juin 2026

function asg(id: string, dueDate: string, title: string, type = 'sprint'): Assignment {
  return {
    id,
    sessionId: `s-${id}`,
    athleteId: 'a',
    status: 'assigned',
    dueDate,
    session: {
      id: `s-${id}`,
      title,
      status: 'published',
      coachId: 'c',
      exercises: { schemaVersion: 3, items: [{ name: 'x', type, order: 0 }] },
    },
  } as unknown as Assignment;
}

const LIST = [
  asg('a', '2026-06-17', 'VMA 30/30', 'endurance'),
  asg('b', '2026-06-21', 'Test 150 m', 'sprint'),
];

function renderTab(extra?: Partial<Parameters<typeof GroupCalendarTab>[0]>) {
  return render(
    wrap(
      <GroupCalendarTab
        assignments={LIST}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        onOpen={extra?.onOpen ?? (() => {})}
        now={NOW}
      />,
    ),
  );
}

describe('GroupCalendarTab (ADR-43 §4)', () => {
  it('affiche la grille du mois courant par défaut', () => {
    renderTab();
    expect(screen.getByTestId('group-calendar-period')).toHaveTextContent('Juin 2026');
    expect(screen.getByTestId('group-calendar-mode-month')).toBeSelected();
  });

  it('bascule en vue Semaine', () => {
    renderTab();
    fireEvent.press(screen.getByLabelText('Semaine'));
    expect(screen.getByTestId('group-calendar-period')).toHaveTextContent(/15 – 21/);
  });

  it('sélectionne aujourd’hui par défaut et liste ses séances', () => {
    renderTab();
    expect(screen.getByTestId('group-session-b')).toBeOnTheScreen();
    expect(screen.queryByTestId('group-session-a')).toBeNull();
  });

  it('sélectionne un autre jour et affiche ses séances', () => {
    renderTab();
    fireEvent.press(screen.getByTestId('group-calendar-cell-2026-06-17'));
    expect(screen.getByTestId('group-session-a')).toBeOnTheScreen();
    expect(screen.getByTestId('group-calendar-day-title')).toHaveTextContent(/17 juin/);
  });

  it('affiche un état vide pour un jour sans séance', () => {
    renderTab();
    fireEvent.press(screen.getByTestId('group-calendar-cell-2026-06-18'));
    expect(screen.getByTestId('group-calendar-day-empty')).toBeOnTheScreen();
  });

  it('la recherche remplace la grille par une liste de résultats', () => {
    renderTab();
    fireEvent.changeText(screen.getByTestId('group-calendar-search'), '150');
    expect(screen.getByTestId('group-calendar-results-title')).toHaveTextContent('1 résultat');
    expect(screen.getByTestId('group-session-b')).toBeOnTheScreen();
    expect(screen.queryByTestId('group-calendar-period')).toBeNull();
  });

  it('recherche sans correspondance', () => {
    renderTab();
    fireEvent.changeText(screen.getByTestId('group-calendar-search'), 'zzz');
    expect(screen.getByTestId('group-calendar-no-match')).toBeOnTheScreen();
  });

  it('ouvre une séance au tap', () => {
    const onOpen = jest.fn();
    renderTab({ onOpen });
    fireEvent.press(screen.getByTestId('group-session-b'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
  });

  it('états chargement et erreur', () => {
    const { rerender } = renderTab();
    rerender(
      wrap(
        <GroupCalendarTab
          isLoading
          isError={false}
          onRetry={() => {}}
          onOpen={() => {}}
          now={NOW}
        />,
      ),
    );
    expect(screen.getByTestId('group-calendar-loading')).toBeOnTheScreen();
    const onRetry = jest.fn();
    rerender(
      wrap(
        <GroupCalendarTab
          isLoading={false}
          isError
          onRetry={onRetry}
          onOpen={() => {}}
          now={NOW}
        />,
      ),
    );
    fireEvent.press(screen.getByTestId('group-calendar-error-retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});
