import { formatCompetitionPeriod } from './competition-ui';

describe('formatCompetitionPeriod (ADR-24)', () => {
  it('un seul jour quand pas de date de fin', () => {
    expect(formatCompetitionPeriod('2026-07-01')).toBe('1 juil. 2026');
  });

  it('un seul jour quand début = fin', () => {
    expect(formatCompetitionPeriod('2026-07-01', '2026-07-01')).toBe('1 juil. 2026');
  });

  it('plage début → fin', () => {
    expect(formatCompetitionPeriod('2026-07-01', '2026-07-03')).toBe('1 → 3 juil. 2026');
  });

  it('accepte un instant ISO complet (jour calendaire, UTC)', () => {
    expect(formatCompetitionPeriod('2026-07-01T00:00:00.000Z')).toBe('1 juil. 2026');
  });

  it('chaîne vide si la date de début est illisible', () => {
    expect(formatCompetitionPeriod('')).toBe('');
    expect(formatCompetitionPeriod('pas-une-date')).toBe('');
  });
});
