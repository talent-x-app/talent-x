import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { HttpMetricsService } from './http-metrics.service';
import { MetricsController } from './metrics.controller';
import { QueueMetricsService } from './queue-metrics.service';

/**
 * Observabilité du MVP exposée par `GET /metrics` (format Prometheus, ADR-11) :
 * - profondeur de la file de jobs (TLX-83, lecture Redis côté API) ;
 * - métriques applicatives HTTP (taux d'erreur, latence p95, volume d'appels,
 *   connexions actives — TX-OPS-004 §7), collectées par `HttpMetricsInterceptor`
 *   enregistré globalement.
 */
@Module({
  controllers: [MetricsController],
  providers: [
    QueueMetricsService,
    HttpMetricsService,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class MetricsModule {}
