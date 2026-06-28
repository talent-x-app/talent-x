import {
  bestIndex,
  perfHeights,
  pointsInWindow,
  seriesTrend,
  windowDelta,
} from './progress-series';

const NOW = new Date('2026-06-10T12:00:00.000Z');

describe('progress-series (A-06 — TLX-090)', () => {
  describe('pointsInWindow', () => {
    const points = [
      { date: '2025-05-01', value: 8 },
      { date: '2026-05-20', value: 7.6 },
      { date: '2026-06-08', value: 7.45 },
    ];

    it('filtre sur la fenêtre glissante', () => {
      expect(pointsInWindow(points, 'week', NOW).map((p) => p.date)).toEqual(['2026-06-08']);
      expect(pointsInWindow(points, 'month', NOW).map((p) => p.date)).toEqual([
        '2026-05-20',
        '2026-06-08',
      ]);
      expect(pointsInWindow(points, 'year', NOW)).toHaveLength(2);
    });

    it('date invalide ignorée', () => {
      expect(pointsInWindow([{ date: 'n/a', value: 1 }], 'month', NOW)).toEqual([]);
    });
  });

  describe('seriesTrend', () => {
    it('sens de l’épreuve respecté : un chrono qui baisse progresse', () => {
      const chrono = [
        { date: '2026-06-01', value: 7.6 },
        { date: '2026-06-08', value: 7.45 },
      ];
      expect(seriesTrend(chrono, 'min')).toBe('up');
      expect(seriesTrend(chrono, 'max')).toBe('down');
      expect(seriesTrend([chrono[0]], 'min')).toBeUndefined();
      expect(
        seriesTrend(
          [
            { date: 'a', value: 7.5 },
            { date: 'b', value: 7.5 },
          ],
          'min',
        ),
      ).toBe('flat');
    });
  });

  describe('perfHeights (orientées performance, R9)', () => {
    const marks = [
      { date: 'a', value: 7.3 },
      { date: 'b', value: 7.6 },
    ];

    it('sens max : la valeur la plus haute est en haut', () => {
      const h = perfHeights(marks, 'max');
      expect(h[0]).toBeCloseTo(0.12); // 7.3 = plus basse → en bas
      expect(h[1]).toBeCloseTo(0.88); // 7.6 = plus haute → en haut
    });

    it('sens min (chrono) : la valeur la plus basse est en haut', () => {
      const h = perfHeights(marks, 'min');
      expect(h[0]).toBeCloseTo(0.88); // 7.3 = meilleur chrono → en haut
      expect(h[1]).toBeCloseTo(0.12);
    });

    it('série plate → mi-hauteur ; vide → vide', () => {
      expect(
        perfHeights(
          [
            { date: 'a', value: 5 },
            { date: 'b', value: 5 },
          ],
          'min',
        ),
      ).toEqual([0.5, 0.5]);
      expect(perfHeights([], 'min')).toEqual([]);
    });
  });

  describe('windowDelta (delta net orienté performance, ADR-56)', () => {
    it('chrono qui baisse → amélioration ; date de départ portée', () => {
      const d = windowDelta(
        [
          { date: '2026-06-04', value: 7.82 },
          { date: '2026-06-27', value: 7.46 },
        ],
        'min',
      );
      expect(d).toEqual({ magnitude: 0.36, improved: true, changed: true, fromDate: '2026-06-04' });
    });

    it('distance qui monte → amélioration ; sens max', () => {
      const d = windowDelta(
        [
          { date: 'a', value: 6.5 },
          { date: 'b', value: 6.84 },
        ],
        'max',
      );
      expect(d?.improved).toBe(true);
      expect(d?.magnitude).toBe(0.34);
    });

    it('régression et égalité', () => {
      expect(
        windowDelta(
          [
            { date: 'a', value: 7.4 },
            { date: 'b', value: 7.6 },
          ],
          'min',
        )?.improved,
      ).toBe(false);
      expect(
        windowDelta(
          [
            { date: 'a', value: 7.5 },
            { date: 'b', value: 7.5 },
          ],
          'min',
        )?.changed,
      ).toBe(false);
      expect(windowDelta([{ date: 'a', value: 7.5 }], 'min')).toBeNull();
    });
  });

  describe('bestIndex (selon le sens de l’épreuve)', () => {
    const marks = [
      { date: 'a', value: 7.6 },
      { date: 'b', value: 7.3 },
      { date: 'c', value: 7.5 },
    ];

    it('min → meilleur = chrono le plus bas ; max → marque la plus haute', () => {
      expect(bestIndex(marks, 'min')).toBe(1);
      expect(bestIndex(marks, 'max')).toBe(0);
      expect(bestIndex([], 'min')).toBe(-1);
    });
  });
});
