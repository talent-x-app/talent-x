import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // GET /api/v1/health — sonde de vie minimale (étendue en TLX-013).
  @Get()
  check(): { status: string } {
    return { status: 'ok' };
  }
}
