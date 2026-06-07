import {
  Controller,
  Delete,
  Get,
  NotImplementedException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Profil & RGPD — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; logique livrée par les tickets dédiés (501).
 */
@ApiTags('Profil & RGPD')
@ApiBearerAuth()
@Controller()
export class UsersController {
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
  @ApiOperation({ summary: 'Supprimer le compte (droit à l\'effacement)', operationId: 'deleteMe' })
  deleteMe(): never {
    throw new NotImplementedException('deleteMe');
  }

  @Get('users/me/consents')
  @ApiOperation({ summary: 'Lister les consentements', operationId: 'getConsents' })
  getConsents(): never {
    throw new NotImplementedException('getConsents');
  }

  @Put('users/me/consents')
  @ApiOperation({ summary: 'Mettre à jour un consentement', operationId: 'updateConsent' })
  updateConsent(): never {
    throw new NotImplementedException('updateConsent');
  }

  @Post('users/me/export')
  @ApiOperation({ summary: 'Demander un export des données', operationId: 'requestExport' })
  requestExport(): never {
    throw new NotImplementedException('requestExport');
  }

  @Get('users/me/export/:jobId')
  @ApiOperation({ summary: "Récupérer un export", operationId: 'getExport' })
  getExport(@Param('jobId') _jobId: string): never {
    throw new NotImplementedException('getExport');
  }
}
