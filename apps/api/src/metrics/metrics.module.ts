import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { QueueMetricsService } from './queue-metrics.service';

/**
 * Observabilité de la file de jobs (TLX-83) : expose `GET /metrics` (format
 * Prometheus) pour l'observabilité managée du MVP (ADR-11). Côté API uniquement
 * (lecture de la profondeur de file) ; le worker reste un process séparé.
 */
@Module({
  controllers: [MetricsController],
  providers: [QueueMetricsService],
})
export class MetricsModule {}
