import {
  Controller,
  Get,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AssignmentsService } from './assignments.service';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { AssignmentDto, AssignmentPageDto } from './dto/assignment.dto';

/**
 * Affectations & performances. Affectations livrées par TLX-051 (liste/détail
 * role-aware) ; les endpoints `performance` restent stubs jusqu'à TLX-070.
 */
@ApiTags('Affectations & performances')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

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
  @ApiOperation({ summary: 'Saisir une performance', operationId: 'submitPerformance' })
  submitPerformance(@Param('id') _id: string): never {
    throw new NotImplementedException('submitPerformance');
  }

  @Get(':id/performance')
  @ApiOperation({ summary: 'Récupérer la performance', operationId: 'getPerformance' })
  getPerformance(@Param('id') _id: string): never {
    throw new NotImplementedException('getPerformance');
  }

  @Put(':id/performance')
  @ApiOperation({ summary: 'Mettre à jour la performance', operationId: 'updatePerformance' })
  updatePerformance(@Param('id') _id: string): never {
    throw new NotImplementedException('updatePerformance');
  }
}
