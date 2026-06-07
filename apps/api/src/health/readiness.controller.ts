import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Système')
@Controller('ready')
export class ReadinessController {
  // GET /api/v1/ready — sonde de disponibilité (dépendances vérifiées en TLX-013).
  @Public()
  @Get()
  @ApiOperation({ summary: 'Readiness', operationId: 'ready' })
  ready(): { status: string } {
    return { status: 'ready' };
  }
}
