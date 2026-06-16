import { isValidCalendarDate, parseCalendarDate } from './calendar-date';

describe('parseCalendarDate (TLX-167)', () => {
  it('parse une date valide en Date UTC à minuit', () => {
    const dt = parseCalendarDate('2026-06-20');
    expect(dt).not.toBeNull();
    expect(dt?.getUTCFullYear()).toBe(2026);
    expect(dt?.getUTCMonth()).toBe(5); // juin = index 5
    expect(dt?.getUTCDate()).toBe(20);
    expect(dt?.getUTCHours()).toBe(0);
  });

  it('ignore les espaces autour', () => {
    expect(parseCalendarDate('  2026-06-20  ')?.getUTCDate()).toBe(20);
  });

  it('accepte le 29 février d’une année bissextile', () => {
    expect(parseCalendarDate('2024-02-29')).not.toBeNull();
  });

  it('rejette le 29 février d’une année non bissextile', () => {
    expect(parseCalendarDate('2026-02-29')).toBeNull();
  });

  it('rejette une chaîne vide ou mal formée', () => {
    expect(parseCalendarDate('')).toBeNull();
    expect(parseCalendarDate('2026-6-9')).toBeNull(); // sans zéro de tête
    expect(parseCalendarDate('01/07/2026')).toBeNull(); // mauvais séparateur
    expect(parseCalendarDate('demain')).toBeNull();
    expect(parseCalendarDate('2026-06-20T10:00:00Z')).toBeNull(); // datetime ISO refusé
  });

  it('rejette les jours/mois impossibles que la regex seule laissait passer', () => {
    expect(parseCalendarDate('2026-02-30')).toBeNull();
    expect(parseCalendarDate('2026-04-31')).toBeNull();
    expect(parseCalendarDate('2026-13-01')).toBeNull();
    expect(parseCalendarDate('2026-00-10')).toBeNull();
    expect(parseCalendarDate('2026-06-00')).toBeNull();
  });
});

describe('isValidCalendarDate (TLX-167)', () => {
  it('reflète parseCalendarDate', () => {
    expect(isValidCalendarDate('2026-06-20')).toBe(true);
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
    expect(isValidCalendarDate('')).toBe(false);
  });
});
