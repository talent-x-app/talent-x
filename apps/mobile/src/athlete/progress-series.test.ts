import { barHeights, pointsInWindow, seriesTrend } from './progress-series';

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

  describe('barHeights', () => {
    it('échelle min/max avec plancher de visibilité', () => {
      const h = barHeights([
        { date: 'a', value: 7.3 },
        { date: 'b', value: 7.6 },
      ]);
      expect(h[0]).toBeCloseTo(0.15);
      expect(h[1]).toBeCloseTo(1);
    });

    it('série plate → mi-hauteur ; vide → vide', () => {
      expect(
        barHeights([
          { date: 'a', value: 5 },
          { date: 'b', value: 5 },
        ]),
      ).toEqual([0.5, 0.5]);
      expect(barHeights([])).toEqual([]);
    });
  });
});
