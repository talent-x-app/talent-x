import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { ReadinessDto } from './dto/readiness.dto';
import { ReadinessService } from './readiness.service';

@ApiTags('Système')
@Controller('ready')
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  // GET /api/v1/ready — readiness : 200 si toutes les dépendances répondent,
  // 503 sinon. Le corps reste au schéma Readiness dans les deux cas (le statut
  // HTTP est posé directement, sans passer par le filtre d'erreur).
  @Public()
  @Get()
  @ApiOperation({ summary: 'Readiness (dépendances)', operationId: 'ready' })
  @ApiResponse({ status: 200, description: 'Prêt.', type: ReadinessDto })
  @ApiResponse({
    status: 503,
    description: "Une dépendance n'est pas disponible.",
    type: ReadinessDto,
  })
  async ready(@Res({ passthrough: true }) res: Response): Promise<ReadinessDto> {
    const result = await this.readiness.check();
    res.status(result.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
