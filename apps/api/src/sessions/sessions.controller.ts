import { Controller, Delete, Get, NotImplementedException, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Séances — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; logique + RBAC/ownership livrés par les tickets dédiés (501).
 */
@ApiTags('Séances')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  @Post()
  @ApiOperation({ summary: 'Créer une séance', operationId: 'createSession' })
  createSession(): never {
    throw new NotImplementedException('createSession');
  }

  @Get()
  @ApiOperation({ summary: 'Lister les séances', operationId: 'listSessions' })
  listSessions(): never {
    throw new NotImplementedException('listSessions');
  }

  @Get(':id')
  @ApiOperation({ summary: "Détail d'une séance", operationId: 'getSession' })
  getSession(@Param('id') _id: string): never {
    throw new NotImplementedException('getSession');
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour une séance', operationId: 'updateSession' })
  updateSession(@Param('id') _id: string): never {
    throw new NotImplementedException('updateSession');
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une séance', operationId: 'deleteSession' })
  deleteSession(@Param('id') _id: string): never {
    throw new NotImplementedException('deleteSession');
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Dupliquer une séance', operationId: 'duplicateSession' })
  duplicateSession(@Param('id') _id: string): never {
    throw new NotImplementedException('duplicateSession');
  }

  @Post(':id/archive')
  @ApiOperation({ summary: 'Archiver une séance', operationId: 'archiveSession' })
  archiveSession(@Param('id') _id: string): never {
    throw new NotImplementedException('archiveSession');
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Affecter une séance à des athlètes', operationId: 'assignSession' })
  assignSession(@Param('id') _id: string): never {
    throw new NotImplementedException('assignSession');
  }
}
