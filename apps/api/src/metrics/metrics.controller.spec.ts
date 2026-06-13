import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { HttpMetricsService } from './http-metrics.service';
import { MetricsController } from './metrics.controller';
import type { QueueMetricsService, QueueMetricsSnapshot } from './queue-metrics.service';

function configMock(values: Record<string, string> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function metricsMock(snapshot: QueueMetricsSnapshot): QueueMetricsService {
  return { snapshot: () => Promise.resolve(snapshot) } as unknown as QueueMetricsService;
}

const SNAPSHOT: QueueMetricsSnapshot = {
  enabled: true,
  up: true,
  counts: { waiting: 1, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
};

function makeController(config: ConfigService, http = new HttpMetricsService()): MetricsController {
  return new MetricsController(metricsMock(SNAPSHOT), http, config);
}

describe('MetricsController', () => {
  it('rend l’exposition Prometheus quand aucun jeton n’est exigé', async () => {
    const controller = makeController(configMock());

    const text = await controller.scrape();

    expect(text).toContain('talentx_export_queue_up{queue="data-export"} 1');
  });

  it('concatène les métriques de file et les métriques HTTP applicatives', async () => {
    const http = new HttpMetricsService();
    http.observe({ method: 'GET', route: '/api/v1/health', status: 200, durationSeconds: 0.01 });
    const controller = makeController(configMock(), http);

    const text = await controller.scrape();

    expect(text).toContain('talentx_export_queue_jobs{queue="data-export",state="waiting"} 1');
    expect(text).toContain('# TYPE talentx_http_requests_total counter');
    expect(text).toContain(
      'talentx_http_requests_total{method="GET",route="/api/v1/health",status="200"} 1',
    );
    expect(text).toContain('talentx_http_requests_in_flight 0');
  });

  it('exige un Bearer valide quand METRICS_TOKEN est défini', async () => {
    const controller = makeController(configMock({ METRICS_TOKEN: 's3cret' }));

    await expect(controller.scrape('Bearer s3cret')).resolves.toContain('talentx_export_queue_up');
  });

  it('401 quand le jeton de scrape est absent ou invalide', async () => {
    const controller = makeController(configMock({ METRICS_TOKEN: 's3cret' }));

    await expect(controller.scrape('Bearer wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.scrape(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
