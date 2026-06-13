import { Body, Controller, HttpCode, Post } from '@nestjs/common';
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
}
