import { HTTP_DURATION_BUCKETS, HttpMetricsService } from './http-metrics.service';

describe('HttpMetricsService', () => {
  it('agrège count/sum/buckets par triplet (méthode, route, statut)', () => {
    const service = new HttpMetricsService();
    service.observe({ method: 'GET', route: '/api/v1/health', status: 200, durationSeconds: 0.02 });
    service.observe({ method: 'GET', route: '/api/v1/health', status: 200, durationSeconds: 0.2 });

    const { series } = service.snapshot();
    expect(series).toHaveLength(1);
    const [s] = series;
    expect(s).toMatchObject({ method: 'GET', route: '/api/v1/health', status: '200', count: 2 });
    expect(s.sumSeconds).toBeCloseTo(0.22, 6);
  });

  it('sépare les séries quand le statut diffère (taux d’erreur dérivable du label)', () => {
    const service = new HttpMetricsService();
    service.observe({ method: 'GET', route: '/api/v1/me', status: 200, durationSeconds: 0.01 });
    service.observe({ method: 'GET', route: '/api/v1/me', status: 500, durationSeconds: 0.01 });

    const statuses = service
      .snapshot()
      .series.map((s) => s.status)
      .sort();
    expect(statuses).toEqual(['200', '500']);
  });

  it('remplit les buckets de façon cumulative selon la borne de durée', () => {
    const service = new HttpMetricsService();
    // 0.02 s ≤ aux bornes ≥ 0.025 ; sous 0.005 et 0.01 il ne compte pas.
    service.observe({ method: 'GET', route: '/r', status: 200, durationSeconds: 0.02 });

    const [s] = service.snapshot().series;
    HTTP_DURATION_BUCKETS.forEach((bound, i) => {
      expect(s.buckets[i]).toBe(0.02 <= bound ? 1 : 0);
    });
    // Le dernier bucket (≤ 10 s) capture l'observation.
    expect(s.buckets[HTTP_DURATION_BUCKETS.length - 1]).toBe(1);
  });

  it('suit les requêtes en cours et ne descend jamais sous zéro', () => {
    const service = new HttpMetricsService();
    service.incInFlight();
    service.incInFlight();
    expect(service.snapshot().inFlight).toBe(2);

    service.decInFlight();
    service.decInFlight();
    service.decInFlight(); // décrément en trop : ignoré
    expect(service.snapshot().inFlight).toBe(0);
  });

  it('snapshot renvoie une copie défensive des buckets', () => {
    const service = new HttpMetricsService();
    service.observe({ method: 'GET', route: '/r', status: 200, durationSeconds: 1 });

    const first = service.snapshot();
    first.series[0].buckets[0] = 999;

    expect(service.snapshot().series[0].buckets[0]).not.toBe(999);
  });
});
