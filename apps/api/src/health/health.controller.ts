import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Système')
@Controller('health')
export class HealthController {
  // GET /api/v1/health — sonde de vie minimale (étendue en TLX-013).
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness', operationId: 'health' })
  check(): { status: string } {
    return { status: 'ok' };
  }
}
