import { filterByText, matchesQuery, normalizeText } from './text-filter';

describe('text-filter (TLX-117)', () => {
  it('normalizeText : minuscule, sans accents, trim', () => {
    expect(normalizeText('  Léa Dubois ')).toBe('lea dubois');
    expect(normalizeText('Côté')).toBe('cote');
  });

  it('matchesQuery : insensible casse/accents, sous-chaîne ; requête vide → vrai', () => {
    expect(matchesQuery('Léa Dubois', 'lea')).toBe(true);
    expect(matchesQuery('Léa Dubois', 'DUB')).toBe(true);
    expect(matchesQuery('Léa Dubois', 'xyz')).toBe(false);
    expect(matchesQuery('Léa', '')).toBe(true);
    expect(matchesQuery('Léa', '   ')).toBe(true);
  });

  it('filterByText : filtre par texte extrait ; requête vide → même liste', () => {
    const items = [{ n: 'Sprint 60m' }, { n: 'Endurance' }, { n: 'Côtes' }];
    expect(filterByText(items, 'cote', (i) => i.n).map((i) => i.n)).toEqual(['Côtes']);
    expect(filterByText(items, '', (i) => i.n)).toBe(items); // même référence
    expect(filterByText(items, 'zzz', (i) => i.n)).toEqual([]);
  });
});
