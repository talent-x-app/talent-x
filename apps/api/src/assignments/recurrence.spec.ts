import { occurrenceDates, RECURRENCE_MAX_OCCURRENCES } from './recurrence';

describe('occurrenceDates (ADR-35)', () => {
  it('génère « chaque mardi » de dueDate jusqu’à until, inclus', () => {
    // 2026-06-09 est un mardi.
    expect(occurrenceDates('2026-06-09', '2026-06-30')).toEqual([
      '2026-06-09',
      '2026-06-16',
      '2026-06-23',
      '2026-06-30',
    ]);
  });

  it('inclut la borne until quand elle tombe pile sur une occurrence', () => {
    expect(occurrenceDates('2026-06-09', '2026-06-23')).toEqual([
      '2026-06-09',
      '2026-06-16',
      '2026-06-23',
    ]);
  });

  it('exclut until si elle tombe entre deux occurrences (même jour de semaine)', () => {
    // until = jeudi → la dernière occurrence reste le mardi précédent.
    expect(occurrenceDates('2026-06-09', '2026-06-25')).toEqual([
      '2026-06-09',
      '2026-06-16',
      '2026-06-23',
    ]);
  });

  it('une seule occurrence quand until == dueDate', () => {
    expect(occurrenceDates('2026-06-09', '2026-06-09')).toEqual(['2026-06-09']);
  });

  it('tableau vide quand until < dueDate (le service en fait un 422)', () => {
    expect(occurrenceDates('2026-06-09', '2026-06-08')).toEqual([]);
  });

  it('reste sur le même jour de semaine en traversant un changement de mois', () => {
    const dates = occurrenceDates('2026-06-30', '2026-07-21');
    expect(dates).toEqual(['2026-06-30', '2026-07-07', '2026-07-14', '2026-07-21']);
  });

  it('ignore l’heure éventuelle d’un dueDate ISO complet', () => {
    expect(occurrenceDates('2026-06-09T10:30:00.000Z', '2026-06-16')).toEqual([
      '2026-06-09',
      '2026-06-16',
    ]);
  });

  it('borne la génération à max + 1 pour permettre la détection de dépassement', () => {
    // until très lointain → on ne matérialise jamais plus de max + 1 dates.
    const dates = occurrenceDates('2026-01-06', '2030-01-01', RECURRENCE_MAX_OCCURRENCES);
    expect(dates).toHaveLength(RECURRENCE_MAX_OCCURRENCES + 1);
  });

  it('respecte un max plus petit passé explicitement', () => {
    expect(occurrenceDates('2026-06-09', '2030-01-01', 2)).toHaveLength(3); // max + 1
  });
});
