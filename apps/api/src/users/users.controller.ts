import {
  Body,
  Controller,
  Delete,
  Get,
  NotImplementedException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConsentsService } from './consents.service';
import { ConsentDto, ConsentListDto } from './dto/consent.dto';
import { ConsentUpdateDto } from './dto/consent-update.dto';

/**
 * Profil & RGPD — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; logique livrée par les tickets dédiés (501).
 * Consentements (GET/PUT /users/me/consents) implémentés en TLX-031.
 */
@ApiTags('Profil & RGPD')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly consents: ConsentsService) {}
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
  @ApiOperation({ summary: "Supprimer le compte (droit à l'effacement)", operationId: 'deleteMe' })
  deleteMe(): never {
    throw new NotImplementedException('deleteMe');
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
  @ApiOperation({ summary: 'Demander un export des données', operationId: 'requestExport' })
  requestExport(): never {
    throw new NotImplementedException('requestExport');
  }

  @Get('users/me/export/:jobId')
  @ApiOperation({ summary: 'Récupérer un export', operationId: 'getExport' })
  getExport(@Param('jobId') _jobId: string): never {
    throw new NotImplementedException('getExport');
  }
}
