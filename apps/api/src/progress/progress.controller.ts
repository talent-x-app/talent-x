import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AthleteProgressService } from './athlete-progress.service';
import { CoachInsightsService } from './coach-insights.service';
import { RecordsService } from './records.service';
import { DashboardDto } from './dto/dashboard.dto';
import { ProgressDto } from './dto/progress.dto';
import {
  ManualRecordRequestDto,
  PersonalRecordDto,
  PersonalRecordListDto,
  RecordConfirmDto,
} from './dto/record.dto';
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
  constructor(
    private readonly insights: CoachInsightsService,
    private readonly records: RecordsService,
    private readonly progress: AthleteProgressService,
  ) {}

  @Get('athletes/me/progress')
  @Roles('athlete')
  @ApiOperation({ summary: 'Ma progression', operationId: 'getMyProgress' })
  @ApiResponse({ status: 200, description: 'Progression.', type: ProgressDto })
  getMyProgress(@CurrentUser('id') athleteId: string): Promise<ProgressDto> {
    return this.progress.getMyProgress(athleteId);
  }

  @Get('athletes/me/records')
  @Roles('athlete')
  @ApiOperation({ summary: 'Mes records personnels', operationId: 'listMyRecords' })
  @ApiResponse({ status: 200, description: 'Records personnels.', type: PersonalRecordListDto })
  listMyRecords(@CurrentUser('id') athleteId: string): Promise<PersonalRecordListDto> {
    return this.records.listMine(athleteId);
  }

  @Post('athletes/me/records')
  @Roles('athlete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Déclarer/corriger un record manuel (ADR-32)',
    operationId: 'createManualRecord',
  })
  @ApiResponse({ status: 200, description: 'Record créé ou remplacé.', type: PersonalRecordDto })
  createManualRecord(
    @CurrentUser('id') athleteId: string,
    @Body() dto: ManualRecordRequestDto,
  ): Promise<PersonalRecordDto> {
    return this.records.createManual(athleteId, dto);
  }

  @Put('athletes/me/records/:eventKey')
  @Roles('athlete')
  @ApiOperation({
    summary: 'Confirmer un candidat record (ADR-20)',
    operationId: 'confirmRecord',
  })
  @ApiResponse({ status: 200, description: 'Record créé ou mis à jour.', type: PersonalRecordDto })
  confirmRecord(
    @CurrentUser('id') athleteId: string,
    @Param('eventKey') eventKey: string,
    @Body() dto: RecordConfirmDto,
  ): Promise<PersonalRecordDto> {
    return this.records.confirm(athleteId, eventKey, dto.performanceId);
  }

  @Get('athletes/:id/records')
  @Roles('coach')
  @ApiOperation({ summary: "Records d'un athlète lié", operationId: 'listAthleteRecords' })
  @ApiResponse({ status: 200, description: 'Records personnels.', type: PersonalRecordListDto })
  listAthleteRecords(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PersonalRecordListDto> {
    return this.records.listForCoach(coachId, id);
  }

  @Get('athletes/:id/progress')
  @Roles('coach')
  @ApiOperation({
    summary: "Progression d'un athlète lié",
    operationId: 'getAthleteProgress',
  })
  @ApiResponse({ status: 200, description: 'Progression.', type: ProgressDto })
  getAthleteProgress(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProgressDto> {
    return this.progress.getForCoach(coachId, id);
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
