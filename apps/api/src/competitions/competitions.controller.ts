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
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CompetitionsService } from './competitions.service';
import { EntriesService } from './entries.service';
import { CompetitionCreateDto } from './dto/competition-create.dto';
import { CompetitionUpdateDto } from './dto/competition-update.dto';
import { CompetitionQueryDto } from './dto/competition-query.dto';
import { CompetitionDto, CompetitionPageDto } from './dto/competition.dto';
import { EngageRequestDto } from './dto/engage-request.dto';
import { CompetitionEntryListDto } from './dto/competition-entry.dto';

/**
 * Compétitions & engagements (TLX-101, ADR-24). Miroir de sessions/assignments :
 * écriture réservée au **coach** propriétaire (ownership dans le service) ; lecture
 * ouverte au coach propriétaire ou à l'athlète **engagé**. Engagement idempotent
 * (en-tête `Idempotency-Key` exigé comme `assign`). RGPD : planification, pas de santé.
 */
@ApiTags('Compétitions')
@ApiBearerAuth()
@Controller('competitions')
export class CompetitionsController {
  constructor(
    private readonly competitions: CompetitionsService,
    private readonly entries: EntriesService,
  ) {}

  @Post()
  @Roles('coach')
  @HttpCode(201)
  @ApiOperation({ summary: 'Créer une compétition', operationId: 'createCompetition' })
  @ApiResponse({ status: 201, description: 'Compétition créée.', type: CompetitionDto })
  createCompetition(
    @CurrentUser('id') coachId: string,
    @Body() dto: CompetitionCreateDto,
  ): Promise<CompetitionDto> {
    return this.competitions.createCompetition(coachId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister les compétitions (coach : les siennes ; athlète : engagées)',
    operationId: 'listCompetitions',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des compétitions.',
    type: CompetitionPageDto,
  })
  listCompetitions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CompetitionQueryDto,
  ): Promise<CompetitionPageDto> {
    return this.competitions.listCompetitions(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lire une compétition autorisée', operationId: 'getCompetition' })
  @ApiResponse({ status: 200, description: 'Compétition.', type: CompetitionDto })
  getCompetition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CompetitionDto> {
    return this.competitions.getCompetition(user, id);
  }

  @Put(':id')
  @Roles('coach')
  @ApiOperation({ summary: 'Modifier une compétition', operationId: 'updateCompetition' })
  @ApiResponse({ status: 200, description: 'Compétition mise à jour.', type: CompetitionDto })
  updateCompetition(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CompetitionUpdateDto,
  ): Promise<CompetitionDto> {
    return this.competitions.updateCompetition(coachId, id, dto);
  }

  @Delete(':id')
  @Roles('coach')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Supprimer (logique) une compétition',
    operationId: 'deleteCompetition',
  })
  @ApiResponse({ status: 204, description: 'Compétition supprimée.' })
  deleteCompetition(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.competitions.deleteCompetition(coachId, id);
  }

  @Post(':id/entries')
  @Roles('coach')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Engager des athlètes à une compétition',
    operationId: 'engageAthletes',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: "Clé d'idempotence client." })
  @ApiResponse({ status: 201, description: 'Engagements créés.', type: CompetitionEntryListDto })
  engageAthletes(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EngageRequestDto,
    @Headers('Idempotency-Key') idempotencyKey?: string,
  ): Promise<CompetitionEntryListDto> {
    // Contrat : en-tête requis (côté client). L'idempotence effective est assurée par
    // l'index unique partiel (compétition, athlète) au niveau du service.
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('En-tête Idempotency-Key requis.');
    }
    return this.entries.engageAthletes(coachId, id, dto);
  }

  @Get(':id/entries')
  @ApiOperation({ summary: 'Lister les engagements', operationId: 'listEntries' })
  @ApiResponse({
    status: 200,
    description: 'Engagements de la compétition.',
    type: CompetitionEntryListDto,
  })
  listEntries(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CompetitionEntryListDto> {
    return this.entries.listEntries(user, id);
  }

  @Delete(':id/entries/:entryId')
  @Roles('coach')
  @HttpCode(204)
  @ApiOperation({ summary: 'Désengager un athlète', operationId: 'unengageAthlete' })
  @ApiResponse({ status: 204, description: 'Engagement supprimé.' })
  unengageAthlete(
    @CurrentUser('id') coachId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
  ): Promise<void> {
    return this.entries.unengageAthlete(coachId, id, entryId);
  }
}
