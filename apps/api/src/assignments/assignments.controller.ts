import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AssignmentsService } from './assignments.service';
import { PerformancesService } from './performances.service';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { AssignmentDto, AssignmentPageDto } from './dto/assignment.dto';
import { PerformanceCreateDto, PerformanceDto } from './dto/performance.dto';

/**
 * Affectations & performances. Affectations livrées par TLX-051 (liste/détail
 * role-aware) ; les endpoints `performance` restent stubs jusqu'à TLX-070.
 */
@ApiTags('Affectations & performances')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly performances: PerformancesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lister ses affectations', operationId: 'listAssignments' })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des affectations.',
    type: AssignmentPageDto,
  })
  listAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AssignmentQueryDto,
  ): Promise<AssignmentPageDto> {
    return this.assignments.listAssignments(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'une affectation", operationId: 'getAssignment' })
  @ApiResponse({ status: 200, description: 'Affectation.', type: AssignmentDto })
  getAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AssignmentDto> {
    return this.assignments.getAssignment(user, id);
  }

  @Post(':id/performance')
  @HttpCode(201)
  @ApiOperation({ summary: 'Soumettre la performance', operationId: 'submitPerformance' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: "Clé d'idempotence client." })
  @ApiResponse({ status: 201, description: 'Performance enregistrée.', type: PerformanceDto })
  submitPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PerformanceCreateDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<PerformanceDto> {
    // Contrat : en-tête requis. Idempotence effective via l'unicité de assignment_id.
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('En-tête Idempotency-Key requis.');
    }
    return this.performances.submitPerformance(user, id, dto);
  }

  @Get(':id/performance')
  @ApiOperation({ summary: 'Lire la performance', operationId: 'getPerformance' })
  @ApiResponse({ status: 200, description: 'Performance.', type: PerformanceDto })
  getPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PerformanceDto> {
    return this.performances.getPerformance(user, id);
  }

  @Put(':id/performance')
  @ApiOperation({ summary: 'Mettre à jour la performance', operationId: 'updatePerformance' })
  @ApiResponse({ status: 200, description: 'Performance mise à jour.', type: PerformanceDto })
  updatePerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PerformanceCreateDto,
  ): Promise<PerformanceDto> {
    return this.performances.updatePerformance(user, id, dto);
  }
}
