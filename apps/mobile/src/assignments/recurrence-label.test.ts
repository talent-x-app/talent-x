import { weekdayLabel } from './recurrence-label';

describe('weekdayLabel (ADR-35)', () => {
  it('renvoie le jour de semaine en français', () => {
    expect(weekdayLabel('2026-06-09')).toBe('mardi'); // mardi
    expect(weekdayLabel('2026-06-14')).toBe('dimanche');
    expect(weekdayLabel('2026-06-15')).toBe('lundi');
  });

  it('ignore les espaces autour', () => {
    expect(weekdayLabel('  2026-06-09  ')).toBe('mardi');
  });

  it('renvoie null pour une date vide ou mal formée', () => {
    expect(weekdayLabel('')).toBeNull();
    expect(weekdayLabel('2026-6-9')).toBeNull();
    expect(weekdayLabel('pas une date')).toBeNull();
  });

  it('renvoie null pour une date calendaire invalide', () => {
    expect(weekdayLabel('2026-02-30')).toBeNull();
  });
});
