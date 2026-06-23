import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AssignmentsService } from './assignments.service';
import { PerformancesService } from './performances.service';
import { KudosService } from './kudos.service';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { AssignmentDto, AssignmentPageDto } from './dto/assignment.dto';
import { AssignmentUpdateRequestDto } from './dto/assignment-update.dto';
import { AttendanceRequestDto, AttendanceSummaryDto } from './dto/attendance.dto';
import { KudosSummaryDto, TeammateAttendanceListDto } from './dto/kudos.dto';
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
    private readonly kudos: KudosService,
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

  @Patch(':id')
  @ApiOperation({
    summary: 'Mettre à jour une affectation (replanifier, skip, démarrer)',
    operationId: 'updateAssignment',
  })
  @ApiResponse({ status: 200, description: 'Affectation mise à jour.', type: AssignmentDto })
  updateAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignmentUpdateRequestDto,
  ): Promise<AssignmentDto> {
    return this.assignments.patchAssignment(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Désassigner (retirer une affectation)',
    operationId: 'deleteAssignment',
  })
  @ApiResponse({ status: 204, description: 'Affectation retirée.' })
  deleteAssignment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.assignments.removeAssignment(user, id);
  }

  @Put(':id/attendance')
  @Roles('athlete')
  @ApiOperation({
    summary: 'Déclarer sa présence (RSVP)',
    operationId: 'setAttendance',
  })
  @ApiResponse({ status: 200, description: 'Présence déclarée.', type: AssignmentDto })
  setAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AttendanceRequestDto,
  ): Promise<AssignmentDto> {
    return this.assignments.setAttendance(user, id, dto);
  }

  @Get(':id/attendance-summary')
  @ApiOperation({
    summary: 'Agrégat de présence de la séance (compteur sans noms)',
    operationId: 'getAttendanceSummary',
  })
  @ApiResponse({ status: 200, description: 'Agrégat de présence.', type: AttendanceSummaryDto })
  getAttendanceSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<AttendanceSummaryDto> {
    return this.assignments.getAttendanceSummary(user, id);
  }

  @Get(':id/teammates-attendance')
  @Roles('athlete')
  @ApiOperation({
    summary: 'Coéquipiers ayant confirmé leur présence (Mur Palier 2)',
    operationId: 'getTeammatesAttendance',
  })
  @ApiResponse({
    status: 200,
    description: 'Coéquipiers présents.',
    type: TeammateAttendanceListDto,
  })
  getTeammatesAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<TeammateAttendanceListDto> {
    return this.kudos.listTeammatesAttendance(user, id);
  }

  @Put(':id/kudos')
  @Roles('athlete')
  @ApiOperation({
    summary: "Encourager la présence d'un coéquipier (kudos)",
    operationId: 'giveKudos',
  })
  @ApiResponse({ status: 200, description: 'Kudos posé.', type: KudosSummaryDto })
  giveKudos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<KudosSummaryDto> {
    return this.kudos.give(user, id);
  }

  @Delete(':id/kudos')
  @Roles('athlete')
  @ApiOperation({ summary: 'Retirer son kudos', operationId: 'removeKudos' })
  @ApiResponse({ status: 200, description: 'Kudos retiré.', type: KudosSummaryDto })
  removeKudos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<KudosSummaryDto> {
    return this.kudos.remove(user, id);
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
