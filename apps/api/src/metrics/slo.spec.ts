import {
  DEFAULT_SLO,
  evaluateSlo,
  histogramQuantile,
  httpDurationQuantile,
  httpErrorSummary,
  parsePrometheusText,
  percentile,
  summarizeLatencies,
  summarizeMetrics,
  type HistogramBucket,
} from './slo';

describe('parsePrometheusText', () => {
  it('parse name, labels et valeur ; ignore commentaires et lignes vides', () => {
    const text = [
      '# HELP talentx_http_requests_total Nombre total de requêtes HTTP traitées.',
      '# TYPE talentx_http_requests_total counter',
      'talentx_http_requests_total{method="GET",route="/api/v1/health",status="200"} 42',
      '',
      'talentx_http_requests_in_flight 0',
    ].join('\n');

    const samples = parsePrometheusText(text);

    expect(samples).toEqual([
      {
        name: 'talentx_http_requests_total',
        labels: { method: 'GET', route: '/api/v1/health', status: '200' },
        value: 42,
      },
      { name: 'talentx_http_requests_in_flight', labels: {}, value: 0 },
    ]);
  });

  it('gère le bucket +Inf et déséchappe les valeurs de label', () => {
    const text = ['talentx_http_request_duration_seconds_bucket{route="/a\\"b",le="+Inf"} 7'].join(
      '\n',
    );

    const [sample] = parsePrometheusText(text);

    expect(sample.labels.le).toBe('+Inf');
    expect(sample.labels.route).toBe('/a"b');
    expect(sample.value).toBe(7);
  });

  it('saute les lignes inexploitables sans lever', () => {
    expect(parsePrometheusText('ceci nest pas une métrique !!!')).toEqual([]);
  });
});

describe('histogramQuantile', () => {
  // Buckets cumulés : 5 obs ≤0.1, 8 ≤0.5, 10 ≤1, 10 au total (+Inf).
  const buckets: HistogramBucket[] = [
    { le: 0.1, count: 5 },
    { le: 0.5, count: 8 },
    { le: 1, count: 10 },
    { le: Number.POSITIVE_INFINITY, count: 10 },
  ];

  it('interpole linéairement dans le bucket contenant le rang', () => {
    // p50 → rang 5 : pile à la borne du 1er bucket (cumul 5) → 0.1.
    expect(histogramQuantile(buckets, 0.5)).toBeCloseTo(0.1, 6);
    // p95 → rang 9.5, dans (0.5,1] : 0.5 + 0.5×((9.5−8)/(10−8)) = 0.875.
    expect(histogramQuantile(buckets, 0.95)).toBeCloseTo(0.875, 6);
  });

  it('interpole depuis 0 dans le premier bucket', () => {
    // p10 → rang 1, dans (0,0.1] : 0 + 0.1×(1/5) = 0.02.
    expect(histogramQuantile(buckets, 0.1)).toBeCloseTo(0.02, 6);
  });

  it('plafonne à la plus haute borne finie quand le rang tombe dans +Inf', () => {
    const heavyTail: HistogramBucket[] = [
      { le: 1, count: 5 },
      { le: Number.POSITIVE_INFINITY, count: 10 },
    ];
    // p95 → rang 9.5 > 5 (cumul à le=1) → tombe dans +Inf → plafonné à 1.
    expect(histogramQuantile(heavyTail, 0.95)).toBe(1);
  });

  it('renvoie null sans borne +Inf, sans observation, ou quantile hors [0,1]', () => {
    expect(histogramQuantile([{ le: 1, count: 3 }], 0.95)).toBeNull();
    expect(
      histogramQuantile(
        [
          { le: 1, count: 0 },
          { le: Number.POSITIVE_INFINITY, count: 0 },
        ],
        0.95,
      ),
    ).toBeNull();
    expect(histogramQuantile(buckets, 1.5)).toBeNull();
  });
});

describe('httpDurationQuantile / httpErrorSummary (dérivations TLX-76)', () => {
  // Deux routes ; on agrège par `le` comme `sum by (le)`.
  const metricsText = [
    'talentx_http_request_duration_seconds_bucket{method="GET",route="/a",status="200",le="0.1"} 3',
    'talentx_http_request_duration_seconds_bucket{method="GET",route="/a",status="200",le="0.5"} 4',
    'talentx_http_request_duration_seconds_bucket{method="GET",route="/a",status="200",le="1"} 4',
    'talentx_http_request_duration_seconds_bucket{method="GET",route="/a",status="200",le="+Inf"} 4',
    'talentx_http_request_duration_seconds_bucket{method="POST",route="/b",status="500",le="0.1"} 0',
    'talentx_http_request_duration_seconds_bucket{method="POST",route="/b",status="500",le="0.5"} 1',
    'talentx_http_request_duration_seconds_bucket{method="POST",route="/b",status="500",le="1"} 5',
    'talentx_http_request_duration_seconds_bucket{method="POST",route="/b",status="500",le="+Inf"} 6',
    'talentx_http_requests_total{method="GET",route="/a",status="200"} 4',
    'talentx_http_requests_total{method="POST",route="/b",status="500"} 6',
    'talentx_http_requests_total{method="GET",route="/c",status="404"} 2',
  ].join('\n');

  it('agrège la latence par le et filtre par labels', () => {
    const samples = parsePrometheusText(metricsText);
    // GET seul : buckets le=0.1→3, 0.5→4, 1→4, +Inf→4. p95 rang 3.8 ∈ (0.1,0.5].
    const p95Get = httpDurationQuantile(samples, 0.95, (l) => l.method === 'GET');
    expect(p95Get).toBeCloseTo(0.1 + 0.4 * ((3.8 - 3) / (4 - 3)), 6); // 0.42
    // Toutes routes confondues : la queue 5xx tire la p95 plus haut.
    const p95All = httpDurationQuantile(samples, 0.95);
    expect(p95All).not.toBeNull();
    expect(p95All!).toBeGreaterThan(p95Get!);
  });

  it("calcule le taux d'erreur 5xx sur le total", () => {
    const samples = parsePrometheusText(metricsText);
    const summary = httpErrorSummary(samples);
    expect(summary.totalRequests).toBe(12);
    expect(summary.serverErrors).toBe(6);
    expect(summary.errorRate).toBeCloseTo(0.5, 6);
  });

  it('errorRate null sans aucune requête comptée', () => {
    expect(httpErrorSummary([]).errorRate).toBeNull();
  });
});

describe('summarizeMetrics', () => {
  it('mesure p95 lecture (GET) et taux 5xx global par défaut', () => {
    const text = [
      'talentx_http_request_duration_seconds_bucket{method="GET",route="/a",status="200",le="1"} 10',
      'talentx_http_request_duration_seconds_bucket{method="GET",route="/a",status="200",le="+Inf"} 10',
      'talentx_http_requests_total{method="GET",route="/a",status="200"} 10',
    ].join('\n');

    const summary = summarizeMetrics(text);

    expect(summary.totalRequests).toBe(10);
    expect(summary.errorRate).toBe(0);
    expect(summary.p95Seconds).not.toBeNull();
  });
});

describe('evaluateSlo', () => {
  it('OK quand p95 et taux sous les seuils', () => {
    const verdict = evaluateSlo({ p95Seconds: 0.4, errorRate: 0.01 });
    expect(verdict.ok).toBe(true);
    expect(verdict.breaches).toEqual([]);
  });

  it('signale le dépassement de latence et de taux (TX-OPS-004 §8)', () => {
    const verdict = evaluateSlo({ p95Seconds: 1.4, errorRate: 0.08 });
    expect(verdict.ok).toBe(false);
    expect(verdict.breaches).toHaveLength(2);
    expect(verdict.breaches[0]).toContain('latence p95');
    expect(verdict.breaches[1]).toContain("taux d'erreur");
  });

  it('une métrique absente (null) ne déclenche pas de violation', () => {
    expect(evaluateSlo({ p95Seconds: null, errorRate: null }).ok).toBe(true);
  });

  it('respecte des seuils personnalisés', () => {
    expect(
      evaluateSlo({ p95Seconds: 0.6, errorRate: 0 }, { p95Seconds: 0.5, errorRate: 0.05 }).ok,
    ).toBe(false);
  });

  it('expose le SLO de référence du MVP', () => {
    expect(DEFAULT_SLO).toEqual({ p95Seconds: 1, errorRate: 0.05 });
  });
});

describe('percentile / summarizeLatencies (latence client)', () => {
  it('interpole linéairement (rang = q×(n−1))', () => {
    const values = [10, 20, 30, 40];
    expect(percentile(values, 0.5)).toBeCloseTo(25, 6); // entre 20 et 30
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 1)).toBe(40);
  });

  it('ne dépend pas de l’ordre d’entrée', () => {
    expect(percentile([40, 10, 30, 20], 0.5)).toBeCloseTo(25, 6);
  });

  it('résume une série de latences', () => {
    const s = summarizeLatencies([100, 200, 300, 400, 500]);
    expect(s.count).toBe(5);
    expect(s.min).toBe(100);
    expect(s.max).toBe(500);
    expect(s.mean).toBe(300);
    expect(s.p50).toBeCloseTo(300, 6);
  });

  it('résumé neutre sur série vide', () => {
    expect(summarizeLatencies([])).toEqual({
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    });
  });
});
