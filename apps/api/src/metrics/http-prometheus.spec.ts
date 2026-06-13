import { HttpMetricsService } from './http-metrics.service';
import { renderHttpMetrics } from './prometheus';

describe('renderHttpMetrics', () => {
  it('expose le gauge in-flight, le counter et l’histogramme de latence', () => {
    const service = new HttpMetricsService();
    service.incInFlight();
    service.observe({
      method: 'GET',
      route: '/api/v1/athletes/:id/progress',
      status: 200,
      durationSeconds: 0.02,
    });

    const text = renderHttpMetrics(service.snapshot());

    expect(text).toContain('# TYPE talentx_http_requests_in_flight gauge');
    expect(text).toContain('talentx_http_requests_in_flight 1');
    expect(text).toContain('# TYPE talentx_http_requests_total counter');
    expect(text).toContain(
      'talentx_http_requests_total{method="GET",route="/api/v1/athletes/:id/progress",status="200"} 1',
    );
    expect(text).toContain('# TYPE talentx_http_request_duration_seconds histogram');
    // Borne 1 s (SLO p95) présente, et le +Inf vaut le count total.
    expect(text).toContain(
      'talentx_http_request_duration_seconds_bucket{method="GET",route="/api/v1/athletes/:id/progress",status="200",le="1"} 1',
    );
    expect(text).toContain(
      'talentx_http_request_duration_seconds_bucket{method="GET",route="/api/v1/athletes/:id/progress",status="200",le="+Inf"} 1',
    );
    expect(text).toContain(
      'talentx_http_request_duration_seconds_count{method="GET",route="/api/v1/athletes/:id/progress",status="200"} 1',
    );
    expect(text.endsWith('\n')).toBe(true);
  });

  it('n’émet aucune série de durée quand rien n’a été observé', () => {
    const text = renderHttpMetrics(new HttpMetricsService().snapshot());

    expect(text).toContain('talentx_http_requests_in_flight 0');
    expect(text).not.toContain('talentx_http_request_duration_seconds_bucket');
    expect(text).not.toContain('talentx_http_requests_total{');
  });

  it('échappe les caractères spéciaux des valeurs de label', () => {
    const service = new HttpMetricsService();
    service.observe({ method: 'GET', route: 'a"b\\c', status: 200, durationSeconds: 0.01 });

    const text = renderHttpMetrics(service.snapshot());

    expect(text).toContain('route="a\\"b\\\\c"');
  });
});
