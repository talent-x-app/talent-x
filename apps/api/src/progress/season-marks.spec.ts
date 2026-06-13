import { seasonAggregates, type DatedMark } from './season-marks';

const d = (iso: string) => new Date(`${iso}T10:00:00.000Z`);
const NOW_2026 = d('2026-06-13');

function marks(...entries: [string, number][]): DatedMark[] {
  return entries.map(([date, value]) => ({ date: d(date), value }));
}

describe('season-marks — seasonAggregates (ADR-34)', () => {
  it('liste vide → aucun SB, tableau vide', () => {
    expect(seasonAggregates([], 'min', NOW_2026)).toEqual({
      seasonBest: undefined,
      marksByYear: [],
    });
  });

  it('épreuve « min » : SB = meilleure (plus petite) marque de l’année en cours', () => {
    const res = seasonAggregates(
      marks(['2026-03-01', 7.6], ['2026-05-01', 7.45], ['2026-06-01', 7.5]),
      'min',
      NOW_2026,
    );
    expect(res.seasonBest).toEqual({ date: '2026-05-01', value: 7.45 });
    expect(res.marksByYear).toEqual([{ year: 2026, best: 7.45, count: 3 }]);
  });

  it('épreuve « max » : SB = meilleure (plus grande) marque', () => {
    const res = seasonAggregates(marks(['2026-03-01', 6.8], ['2026-05-01', 7.1]), 'max', NOW_2026);
    expect(res.seasonBest).toEqual({ date: '2026-05-01', value: 7.1 });
    expect(res.marksByYear).toEqual([{ year: 2026, best: 7.1, count: 2 }]);
  });

  it('tableau par année décroissant, meilleure + nombre par année (sens de l’épreuve)', () => {
    const res = seasonAggregates(
      marks(['2024-05-01', 7.8], ['2024-07-01', 7.7], ['2025-05-01', 7.6], ['2026-04-01', 7.55]),
      'min',
      NOW_2026,
    );
    expect(res.marksByYear).toEqual([
      { year: 2026, best: 7.55, count: 1 },
      { year: 2025, best: 7.6, count: 1 },
      { year: 2024, best: 7.7, count: 2 },
    ]);
    // SB = uniquement l'année en cours (2026).
    expect(res.seasonBest).toEqual({ date: '2026-04-01', value: 7.55 });
  });

  it('aucune marque l’année en cours → SB absent mais tableau historique présent', () => {
    const res = seasonAggregates(marks(['2024-05-01', 7.8], ['2025-05-01', 7.6]), 'min', NOW_2026);
    expect(res.seasonBest).toBeUndefined();
    expect(res.marksByYear).toEqual([
      { year: 2025, best: 7.6, count: 1 },
      { year: 2024, best: 7.8, count: 1 },
    ]);
  });

  it('égalité de valeur dans l’année → garde la marque la plus ancienne', () => {
    const res = seasonAggregates(
      marks(['2026-05-10', 7.45], ['2026-03-02', 7.45]),
      'min',
      NOW_2026,
    );
    expect(res.seasonBest).toEqual({ date: '2026-03-02', value: 7.45 });
  });

  it('now injecté : déplacer l’année en cours à 2027 retire le SB des marques 2026', () => {
    const res = seasonAggregates(marks(['2026-05-01', 7.45]), 'min', d('2027-02-01'));
    expect(res.seasonBest).toBeUndefined();
    expect(res.marksByYear).toEqual([{ year: 2026, best: 7.45, count: 1 }]);
  });
});
