import { type DashboardAthlete } from '@talent-x/api-client';
import { ThemeProvider } from '@talent-x/design-tokens';
import { render, screen } from '@testing-library/react-native';
import { AthleteListItem, sortAthletesByStatus } from './athlete-ui';

/** Fabrique un athlète de dashboard minimal (champs non pertinents par défaut). */
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

describe('sortAthletesByStatus (TLX-147)', () => {
  it('trie par sévérité de statut : en retard → à revoir → à jour', () => {
    const list = [
      athlete({ id: 'ok', status: 'up_to_date' }),
      athlete({ id: 'rev', status: 'pending_review' }),
      athlete({ id: 'late', status: 'late' }),
    ];
    expect(sortAthletesByStatus(list).map((a) => a.id)).toEqual(['late', 'rev', 'ok']);
  });

  it('égalité de statut → ordre alphabétique par nom (accents ignorés)', () => {
    const list = [
      athlete({ id: 'z', status: 'late', firstName: 'Zoé', lastName: 'Martin' }),
      athlete({ id: 'e', status: 'late', firstName: 'Élodie', lastName: 'Bah' }),
      athlete({ id: 'a', status: 'late', firstName: 'Adam', lastName: 'Costa' }),
    ];
    // Adam < Élodie < Zoé (« É » trié comme « E »).
    expect(sortAthletesByStatus(list).map((a) => a.id)).toEqual(['a', 'e', 'z']);
  });

  it('sévérité d’abord, nom seulement en cas d’égalité', () => {
    const list = [
      athlete({ id: 'ok-anna', status: 'up_to_date', firstName: 'Anna', lastName: '' }),
      athlete({ id: 'late-zoe', status: 'late', firstName: 'Zoé', lastName: '' }),
      athlete({ id: 'rev-anna', status: 'pending_review', firstName: 'Anna', lastName: '' }),
    ];
    expect(sortAthletesByStatus(list).map((a) => a.id)).toEqual([
      'late-zoe',
      'rev-anna',
      'ok-anna',
    ]);
  });

  it('liste vide → liste vide ; copie défensive (source intacte)', () => {
    expect(sortAthletesByStatus([])).toEqual([]);
    const source: DashboardAthlete[] = [
      athlete({ id: 'ok', status: 'up_to_date' }),
      athlete({ id: 'late', status: 'late' }),
    ];
    const sorted = sortAthletesByStatus(source);
    expect(sorted).not.toBe(source); // nouvelle référence
    expect(sorted.map((a) => a.id)).toEqual(['late', 'ok']);
    expect(source.map((a) => a.id)).toEqual(['ok', 'late']); // source non mutée
  });
});

describe('AthleteListItem — photo de l’athlète vue du coach (TLX-252, ADR-37 §A1)', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider>{children}</ThemeProvider>
  );

  it('avec photo : rend l’image présignée, pas les initiales', () => {
    render(
      <AthleteListItem
        athlete={athlete({ id: 'a-1', avatarUrl: 'https://signed/avatar' }) as DashboardAthlete}
      />,
      { wrapper },
    );

    const image = screen.getByTestId('athlete-avatar-a-1');
    expect(image).toBeOnTheScreen();
    expect(image.props.source).toEqual({ uri: 'https://signed/avatar' });
    expect(screen.queryByTestId('athlete-initials-a-1')).toBeNull();
  });

  it('sans photo : repli sur les initiales', () => {
    render(
      <AthleteListItem
        athlete={athlete({ id: 'a-2', firstName: 'Léa', lastName: 'Dubois' }) as DashboardAthlete}
      />,
      { wrapper },
    );

    expect(screen.getByTestId('athlete-initials-a-2')).toHaveTextContent('LD');
    expect(screen.queryByTestId('athlete-avatar-a-2')).toBeNull();
  });
});
