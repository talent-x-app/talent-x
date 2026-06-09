import { Controller, Get, Header, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PROMETHEUS_CONTENT_TYPE, renderQueueMetrics } from './prometheus';
import { QueueMetricsService } from './queue-metrics.service';

/**
 * GET /metrics — exposition Prometheus des métriques de la file de jobs
 * (TLX-83 / TX-OPS-004 §7). Volontairement HORS préfixe `/api/v1` et HORS
 * contrat OpenAPI : endpoint d'exploitation, scrappé par l'observabilité managée
 * du MVP (ADR-11), pas une route métier.
 *
 * Protection optionnelle par jeton de scrape (`METRICS_TOKEN`) : s'il est défini,
 * un en-tête `Authorization: Bearer <token>` valide est exigé ; sinon l'endpoint
 * est ouvert (dev, ou prod derrière un réseau restreint). Aucun secret en dur.
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: QueueMetricsService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  @Header('Content-Type', PROMETHEUS_CONTENT_TYPE)
  async scrape(@Headers('authorization') authorization?: string): Promise<string> {
    this.assertAuthorized(authorization);
    const snapshot = await this.metrics.snapshot();
    return renderQueueMetrics(snapshot);
  }

  /** Exige le jeton de scrape uniquement si `METRICS_TOKEN` est configuré. */
  private assertAuthorized(authorization?: string): void {
    const token = this.config.get<string>('METRICS_TOKEN')?.trim();
    if (!token) return;
    if (authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException('Jeton de scrape invalide.');
    }
  }
}
