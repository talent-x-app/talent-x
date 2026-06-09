import { Controller, Get, NotImplementedException, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CoachInsightsService } from './coach-insights.service';
import { DashboardDto } from './dto/dashboard.dto';
import { StatsDto } from './dto/stats.dto';

/**
 * Progression (athlète) & pilotage coach. Tableau de bord coach + stats athlète
 * livrés par TLX-080 (dérivations) ; la progression athlète (`/athletes/me/progress`)
 * reste un squelette jusqu'à son ticket dédié (TLX-090).
 */
@ApiTags('Progression')
@ApiBearerAuth()
@Controller()
export class ProgressController {
  constructor(private readonly insights: CoachInsightsService) {}

  @Get('athletes/me/progress')
  @ApiOperation({ summary: 'Ma progression', operationId: 'getMyProgress' })
  getMyProgress(): never {
    // Livré par TLX-090 (écran Progression A-06).
    throw new NotImplementedException('getMyProgress');
  }

  @Get('athletes/:id/stats')
  @Roles('coach')
  @ApiOperation({ summary: "Statistiques d'un athlète", operationId: 'getAthleteStats' })
  @ApiResponse({ status: 200, description: 'Statistiques.', type: StatsDto })
  getAthleteStats(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StatsDto> {
    return this.insights.getAthleteStats(coachId, id);
  }

  @Get('coach/dashboard')
  @Roles('coach')
  @ApiOperation({ summary: 'Tableau de bord coach', operationId: 'getCoachDashboard' })
  @ApiResponse({ status: 200, description: 'Tableau de bord.', type: DashboardDto })
  getCoachDashboard(@CurrentUser('id') coachId: string): Promise<DashboardDto> {
    return this.insights.getCoachDashboard(coachId);
  }
}
