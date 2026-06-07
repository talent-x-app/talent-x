import { Controller, Get, NotImplementedException, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Progression (athlète) & tableau de bord (coach) — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; dérivations livrées par les tickets dédiés (501).
 */
@ApiTags('Progression')
@ApiBearerAuth()
@Controller()
export class ProgressController {
  @Get('athletes/me/progress')
  @ApiOperation({ summary: 'Ma progression', operationId: 'getMyProgress' })
  getMyProgress(): never {
    throw new NotImplementedException('getMyProgress');
  }

  @Get('athletes/:id/stats')
  @ApiOperation({ summary: "Statistiques d'un athlète", operationId: 'getAthleteStats' })
  getAthleteStats(@Param('id') _id: string): never {
    throw new NotImplementedException('getAthleteStats');
  }

  @Get('coach/dashboard')
  @ApiOperation({ summary: 'Tableau de bord coach', operationId: 'getCoachDashboard' })
  getCoachDashboard(): never {
    throw new NotImplementedException('getCoachDashboard');
  }
}
