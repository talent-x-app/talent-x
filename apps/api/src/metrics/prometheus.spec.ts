import { PROMETHEUS_CONTENT_TYPE, renderQueueMetrics } from './prometheus';
import type { QueueMetricsSnapshot } from './queue-metrics.service';

describe('renderQueueMetrics', () => {
  it('expose queue_up=1 et un gauge par état quand la file est joignable', () => {
    const snapshot: QueueMetricsSnapshot = {
      enabled: true,
      up: true,
      counts: { waiting: 3, active: 1, completed: 42, failed: 2, delayed: 0, paused: 0 },
    };

    const text = renderQueueMetrics(snapshot);

    expect(text).toContain('talentx_export_queue_up{queue="data-export"} 1');
    expect(text).toContain('talentx_export_queue_jobs{queue="data-export",state="waiting"} 3');
    expect(text).toContain('talentx_export_queue_jobs{queue="data-export",state="failed"} 2');
    expect(text).toContain('# TYPE talentx_export_queue_jobs gauge');
    // Exposition terminée par un saut de ligne (convention Prometheus).
    expect(text.endsWith('\n')).toBe(true);
  });

  it('expose queue_up=0 et aucun compteur quand la file est injoignable', () => {
    const text = renderQueueMetrics({ enabled: true, up: false });

    expect(text).toContain('talentx_export_queue_up{queue="data-export"} 0');
    expect(text).not.toContain('talentx_export_queue_jobs');
  });

  it('content-type au format exposition Prometheus v0.0.4', () => {
    expect(PROMETHEUS_CONTENT_TYPE).toBe('text/plain; version=0.0.4; charset=utf-8');
  });
});
