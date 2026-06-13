import { DATA_EXPORT_QUEUE } from '../jobs/jobs.constants';
import {
  HTTP_DURATION_BUCKETS,
  type HttpMetricsSnapshot,
  type HttpMetricSeries,
} from './http-metrics.service';
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

/**
 * Rend les métriques applicatives HTTP au format Prometheus (TX-OPS-004 §7 :
 * taux d'erreur, latence p95, volume d'appels, connexions actives) :
 * - `talentx_http_requests_in_flight` (gauge) — requêtes en cours ;
 * - `talentx_http_requests_total` (counter, labels method/route/status) — volume
 *   d'appels ; le taux d'erreur se dérive du label `status` côté scrapeur ;
 * - `talentx_http_request_duration_seconds` (histogram) — la latence p95 se dérive
 *   des buckets via `histogram_quantile`.
 *
 * Fonction pure (pas d'I/O) : l'accumulation vit dans `HttpMetricsService`.
 */
export function renderHttpMetrics(snapshot: HttpMetricsSnapshot): string {
  const lines: string[] = [];

  lines.push('# HELP talentx_http_requests_in_flight Requêtes HTTP en cours de traitement.');
  lines.push('# TYPE talentx_http_requests_in_flight gauge');
  lines.push(`talentx_http_requests_in_flight ${snapshot.inFlight}`);

  lines.push('# HELP talentx_http_requests_total Nombre total de requêtes HTTP traitées.');
  lines.push('# TYPE talentx_http_requests_total counter');
  for (const series of snapshot.series) {
    lines.push(`talentx_http_requests_total{${httpLabels(series)}} ${series.count}`);
  }

  lines.push('# HELP talentx_http_request_duration_seconds Durée des requêtes HTTP en secondes.');
  lines.push('# TYPE talentx_http_request_duration_seconds histogram');
  for (const series of snapshot.series) {
    const labels = httpLabels(series);
    HTTP_DURATION_BUCKETS.forEach((bound, i) => {
      lines.push(
        `talentx_http_request_duration_seconds_bucket{${labels},le="${bound}"} ${series.buckets[i]}`,
      );
    });
    lines.push(`talentx_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${series.count}`);
    lines.push(`talentx_http_request_duration_seconds_sum{${labels}} ${series.sumSeconds}`);
    lines.push(`talentx_http_request_duration_seconds_count{${labels}} ${series.count}`);
  }

  return `${lines.join('\n')}\n`;
}

/** Jeu de labels d'une série HTTP, valeurs échappées (convention Prometheus). */
function httpLabels(series: HttpMetricSeries): string {
  return [
    `method="${escapeLabelValue(series.method)}"`,
    `route="${escapeLabelValue(series.route)}"`,
    `status="${escapeLabelValue(series.status)}"`,
  ].join(',');
}

/** Échappe `\`, `"` et saut de ligne dans une valeur de label (spec exposition Prometheus). */
function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
