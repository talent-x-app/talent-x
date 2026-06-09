import type { ConfigService } from '@nestjs/config';
import { QueueMetricsService } from './queue-metrics.service';

/** ConfigService factice : `REDIS_URL` absent par défaut (file non vérifiée). */
function configMock(values: Record<string, string> = {}): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

/** Remplace l'ouverture de Queue par un double avec `getJobCounts`. */
function withQueue(
  service: QueueMetricsService,
  getJobCounts: () => Promise<Record<string, number>>,
): void {
  (service as unknown as { queue: () => { getJobCounts: typeof getJobCounts } }).queue = () => ({
    getJobCounts,
  });
}

describe('QueueMetricsService', () => {
  it('enabled=false quand REDIS_URL est absent (dev/test sans file)', async () => {
    const service = new QueueMetricsService(configMock());

    await expect(service.snapshot()).resolves.toEqual({ enabled: false, up: false });
  });

  it('remonte les compteurs de file quand Redis répond', async () => {
    const service = new QueueMetricsService(configMock({ REDIS_URL: 'redis://localhost:6379' }));
    withQueue(service, () =>
      Promise.resolve({ waiting: 5, active: 2, completed: 10, failed: 1, delayed: 3, paused: 0 }),
    );

    await expect(service.snapshot()).resolves.toEqual({
      enabled: true,
      up: true,
      counts: { waiting: 5, active: 2, completed: 10, failed: 1, delayed: 3, paused: 0 },
    });
  });

  it('snapshot dégradé (up=false) sans lever quand Redis est injoignable', async () => {
    const service = new QueueMetricsService(configMock({ REDIS_URL: 'redis://localhost:6379' }));
    withQueue(service, () => Promise.reject(new Error('ECONNREFUSED')));

    await expect(service.snapshot()).resolves.toEqual({ enabled: true, up: false });
  });

  it('comble les états absents de getJobCounts par 0', async () => {
    const service = new QueueMetricsService(configMock({ REDIS_URL: 'redis://localhost:6379' }));
    withQueue(service, () => Promise.resolve({ waiting: 4 }));

    await expect(service.snapshot()).resolves.toEqual({
      enabled: true,
      up: true,
      counts: { waiting: 4, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
    });
  });
});
