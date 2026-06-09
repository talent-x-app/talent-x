import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SessionCreateDto } from './dto/session-create.dto';
import { SessionUpdateDto } from './dto/session-update.dto';
import { SessionQueryDto } from './dto/session-query.dto';
import { SessionDto, SessionPageDto } from './dto/session.dto';
import { SessionsService } from './sessions.service';

/**
 * Séances (TLX-050). Écriture réservée au **coach** propriétaire (ownership dans le
 * service) ; lecture ouverte au coach propriétaire ou à l'athlète affecté.
 * `/sessions/:id/assign` (affectation) est livré par TLX-051.
 */
@ApiTags('Séances')
@ApiBearerAuth()
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @Roles('coach')
  @HttpCode(201)
  @ApiOperation({ summary: 'Créer une séance', operationId: 'createSession' })
  @ApiResponse({ status: 201, description: 'Séance créée.', type: SessionDto })
  createSession(
    @CurrentUser('id') coachId: string,
    @Body() dto: SessionCreateDto,
  ): Promise<SessionDto> {
    return this.sessions.createSession(coachId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les séances (coach : les siennes ; athlète : affectées)',
    operationId: 'listSessions',
  })
  @ApiResponse({ status: 200, description: 'Liste paginée des séances.', type: SessionPageDto })
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SessionQueryDto,
  ): Promise<SessionPageDto> {
    return this.sessions.listSessions(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lire une séance autorisée', operationId: 'getSession' })
  @ApiResponse({ status: 200, description: 'Séance.', type: SessionDto })
  getSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SessionDto> {
    return this.sessions.getSession(user, id);
  }

  @Put(':id')
  @Roles('coach')
  @ApiOperation({ summary: 'Modifier une séance', operationId: 'updateSession' })
  @ApiResponse({ status: 200, description: 'Séance mise à jour.', type: SessionDto })
  updateSession(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SessionUpdateDto,
  ): Promise<SessionDto> {
    return this.sessions.updateSession(coachId, id, dto);
  }

  @Delete(':id')
  @Roles('coach')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer (logique) une séance', operationId: 'deleteSession' })
  @ApiResponse({ status: 204, description: 'Séance supprimée.' })
  deleteSession(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.sessions.deleteSession(coachId, id);
  }

  @Post(':id/duplicate')
  @Roles('coach')
  @HttpCode(201)
  @ApiOperation({ summary: 'Dupliquer une séance', operationId: 'duplicateSession' })
  @ApiResponse({ status: 201, description: 'Séance dupliquée.', type: SessionDto })
  duplicateSession(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SessionDto> {
    return this.sessions.duplicateSession(coachId, id);
  }

  @Post(':id/archive')
  @Roles('coach')
  @HttpCode(200)
  @ApiOperation({ summary: 'Archiver une séance', operationId: 'archiveSession' })
  @ApiResponse({ status: 200, description: 'Séance archivée.', type: SessionDto })
  archiveSession(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SessionDto> {
    return this.sessions.archiveSession(coachId, id);
  }

  @Post(':id/assign')
  @Roles('coach')
  @ApiOperation({ summary: 'Affecter une séance à des athlètes', operationId: 'assignSession' })
  assignSession(@Param('id') _id: string): never {
    // Livré par TLX-051 (affectations).
    throw new NotImplementedException('assignSession');
  }
}
