import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { HealthDto } from './dto/health.dto';

@ApiTags('Système')
@Controller('health')
export class HealthController {
  // GET /api/v1/health — liveness : le process répond (pas de dépendance vérifiée).
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness', operationId: 'health' })
  @ApiResponse({ status: 200, description: 'Le service répond.', type: HealthDto })
  check(): HealthDto {
    return { status: 'ok' };
  }
}
