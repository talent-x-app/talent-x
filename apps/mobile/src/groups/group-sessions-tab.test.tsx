import { type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@talent-x/design-tokens';
import type { Assignment } from '@talent-x/api-client';
import { GroupSessionsTab } from './group-sessions-tab';

const wrap = (children: ReactNode) => <ThemeProvider>{children}</ThemeProvider>;
const NOW = new Date(2026, 5, 21);

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

function renderTab(assignments: Assignment[], extra?: { onOpen?: jest.Mock }) {
  return render(
    wrap(
      <GroupSessionsTab
        assignments={assignments}
        isLoading={false}
        isError={false}
        onRetry={() => {}}
        onOpen={extra?.onOpen ?? (() => {})}
        now={NOW}
      />,
    ),
  );
}

describe('GroupSessionsTab (ADR-43 §4)', () => {
  it('met en avant la prochaine séance (next-up) et groupe À venir / Passées', () => {
    renderTab([
      asg('soon', '2026-06-23', 'Footing'),
      asg('today', '2026-06-21', 'Test 150 m'),
      asg('past', '2026-06-14', 'VMA'),
    ]);
    // next-up = la plus proche à venir (aujourd'hui)
    expect(screen.getByTestId('group-next-up')).toHaveTextContent(/Test 150 m/);
    expect(screen.getByTestId('group-upcoming-title')).toHaveTextContent('À venir · 1');
    expect(screen.getByTestId('group-past-title')).toBeOnTheScreen();
  });

  it('affiche « Voir tout l’historique (N) » au-delà de 3 passées', () => {
    const past = [1, 2, 3, 4].map((i) => asg(`p${i}`, `2026-06-0${i}`, `Passée ${i}`));
    renderTab(past);
    const seeAll = screen.getByTestId('group-past-see-all');
    expect(seeAll).toHaveTextContent(/Voir tout l.historique \(4\)/);
    fireEvent.press(seeAll);
    expect(screen.queryByTestId('group-past-see-all')).toBeNull();
  });

  it('état vide quand aucune séance', () => {
    renderTab([]);
    expect(screen.getByTestId('group-sessions-empty')).toBeOnTheScreen();
  });

  it('ouvre une séance au tap sur la carte next-up', () => {
    const onOpen = jest.fn();
    renderTab([asg('today', '2026-06-21', 'Test 150 m')], { onOpen });
    fireEvent.press(screen.getByTestId('group-next-up'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'today' }));
  });

  it('états chargement et erreur', () => {
    const onRetry = jest.fn();
    const { rerender } = renderTab([]);
    rerender(
      wrap(
        <GroupSessionsTab
          isLoading
          isError={false}
          onRetry={onRetry}
          onOpen={() => {}}
          now={NOW}
        />,
      ),
    );
    expect(screen.getByTestId('group-sessions-loading')).toBeOnTheScreen();
    rerender(
      wrap(
        <GroupSessionsTab
          isLoading={false}
          isError
          onRetry={onRetry}
          onOpen={() => {}}
          now={NOW}
        />,
      ),
    );
    fireEvent.press(screen.getByTestId('group-sessions-error-retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});
