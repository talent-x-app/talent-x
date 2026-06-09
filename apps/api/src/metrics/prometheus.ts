import { DATA_EXPORT_QUEUE } from '../jobs/jobs.constants';
import type { QueueMetricsSnapshot } from './queue-metrics.service';

/** Content-Type de l'exposition Prometheus (format texte v0.0.4). */
export const PROMETHEUS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

const QUEUE_LABEL = `queue="${DATA_EXPORT_QUEUE}"`;

/**
 * Rend un snapshot de file au format d'exposition Prometheus (TX-OPS-004 §7 :
 * profondeur, jobs en échec, jobs retardés). Scrappé par l'observabilité managée
 * du MVP (ADR-11) — aucun dashboard ni pile auto-hébergée n'est embarqué.
 *
 * Fonction pure (pas d'I/O) : la lecture de la file vit dans `QueueMetricsService`.
 */
export function renderQueueMetrics(snapshot: QueueMetricsSnapshot): string {
  const lines: string[] = [];

  lines.push('# HELP talentx_export_queue_up File data-export joignable (1) ou non (0).');
  lines.push('# TYPE talentx_export_queue_up gauge');
  lines.push(`talentx_export_queue_up{${QUEUE_LABEL}} ${snapshot.up ? 1 : 0}`);

  if (snapshot.counts) {
    lines.push('# HELP talentx_export_queue_jobs Profondeur de la file data-export par état.');
    lines.push('# TYPE talentx_export_queue_jobs gauge');
    for (const [state, value] of Object.entries(snapshot.counts)) {
      lines.push(`talentx_export_queue_jobs{${QUEUE_LABEL},state="${state}"} ${value}`);
    }
  }

  // Exposition terminée par un saut de ligne (convention Prometheus).
  return `${lines.join('\n')}\n`;
}
