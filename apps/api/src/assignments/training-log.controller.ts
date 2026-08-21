import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PerformanceDto } from './dto/performance.dto';
import { TrainingLogRequestDto } from './dto/training-log.dto';
import { TrainingLogService } from './training-log.service';

/**
 * Journal d'entraînement athlète (ADR-36) : `POST /athletes/me/training-log` consigne une
 * séance libre (hors assignation) et renvoie la performance créée (candidats records inclus).
 */
@ApiTags('Progression')
@ApiBearerAuth()
@Controller()
export class TrainingLogController {
  constructor(private readonly trainingLog: TrainingLogService) {}

  @Post('athletes/me/training-log')
  @Roles('athlete')
  @HttpCode(201)
  @ApiOperation({ summary: 'Enregistrer une séance libre', operationId: 'logTrainingSession' })
  @ApiResponse({ status: 201, description: 'Séance libre enregistrée.', type: PerformanceDto })
  logTrainingSession(
    @CurrentUser('id') athleteId: string,
    @Body() dto: TrainingLogRequestDto,
  ): Promise<PerformanceDto> {
    return this.trainingLog.logTrainingSession(athleteId, dto);
  }

  /**
   * Suppression d'une séance libre (ADR-36 §5, amendement §B1). Endpoint **athlète dédié**, plutôt
   * que d'assouplir le garde de `DELETE /sessions/{id}` : une route, un régime d'autorisation —
   * le même argument qu'ADR-36 §2 avait retenu pour la création.
   */
  @Delete('athletes/me/training-log/:assignmentId')
  @Roles('athlete')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Supprimer une séance libre',
    operationId: 'deleteTrainingLogSession',
  })
  @ApiResponse({ status: 204, description: 'Séance libre supprimée.' })
  @ApiResponse({ status: 404, description: 'Séance libre introuvable (ou non possédée).' })
  deleteTrainingLogSession(
    @CurrentUser('id') athleteId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ): Promise<void> {
    return this.trainingLog.deleteTrainingLogSession(athleteId, assignmentId);
  }
}
