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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountDeletionService } from './account-deletion.service';
import { ConsentsService } from './consents.service';
import { ConsentDto, ConsentListDto } from './dto/consent.dto';
import { ConsentUpdateDto } from './dto/consent-update.dto';
import { ExportJobDto, JobDto } from './dto/export.dto';
import { ExportService } from './export.service';

/**
 * Profil & RGPD — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; logique livrée par les tickets dédiés (501).
 * Consentements (GET/PUT /users/me/consents) implémentés en TLX-031.
 */
@ApiTags('Profil & RGPD')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(
    private readonly consents: ConsentsService,
    private readonly exports: ExportService,
    private readonly accountDeletion: AccountDeletionService,
  ) {}
  @Get('users/me')
  @ApiOperation({ summary: 'Profil courant', operationId: 'getMe' })
  getMe(): never {
    throw new NotImplementedException('getMe');
  }

  @Put('users/me')
  @ApiOperation({ summary: 'Mettre à jour le profil', operationId: 'updateMe' })
  updateMe(): never {
    throw new NotImplementedException('updateMe');
  }

  @Delete('users/me')
  @HttpCode(202)
  @ApiOperation({ summary: "Supprimer le compte (droit à l'effacement)", operationId: 'deleteMe' })
  @ApiResponse({ status: 202, description: 'Suppression planifiée.', type: JobDto })
  deleteMe(@CurrentUser('id') userId: string): Promise<JobDto> {
    return this.accountDeletion.requestDeletion(userId);
  }

  @Get('users/me/consents')
  @ApiOperation({ summary: 'Lister les consentements', operationId: 'getConsents' })
  @ApiResponse({ status: 200, description: 'État des consentements.', type: ConsentListDto })
  getConsents(@CurrentUser('id') userId: string): Promise<ConsentListDto> {
    return this.consents.list(userId);
  }

  @Put('users/me/consents')
  @ApiOperation({ summary: 'Donner ou retirer un consentement', operationId: 'updateConsent' })
  @ApiResponse({ status: 200, description: 'Consentement mis à jour.', type: ConsentDto })
  updateConsent(
    @CurrentUser('id') userId: string,
    @Body() dto: ConsentUpdateDto,
  ): Promise<ConsentDto> {
    return this.consents.update(userId, dto);
  }

  @Post('users/me/export')
  @HttpCode(202)
  @ApiOperation({ summary: 'Demander un export des données', operationId: 'requestExport' })
  @ApiResponse({ status: 202, description: 'Export en cours de préparation.', type: JobDto })
  requestExport(@CurrentUser('id') userId: string): Promise<JobDto> {
    return this.exports.requestExport(userId);
  }

  @Get('users/me/export/:jobId')
  @ApiOperation({ summary: 'Récupérer un export', operationId: 'getExport' })
  @ApiResponse({ status: 200, description: "Statut de l'export.", type: ExportJobDto })
  @ApiResponse({ status: 404, description: 'Export introuvable.' })
  getExport(
    @CurrentUser('id') userId: string,
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ): Promise<ExportJobDto> {
    return this.exports.getExport(userId, jobId);
  }
}
