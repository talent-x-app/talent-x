import {
  Controller,
  Get,
  NotImplementedException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Affectations & performances — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; logique + idempotence (POST performance) livrées
 * par les tickets dédiés (501).
 */
@ApiTags('Affectations & performances')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  @Get()
  @ApiOperation({ summary: 'Lister les affectations', operationId: 'listAssignments' })
  listAssignments(): never {
    throw new NotImplementedException('listAssignments');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une affectation', operationId: 'getAssignment' })
  getAssignment(@Param('id') _id: string): never {
    throw new NotImplementedException('getAssignment');
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
