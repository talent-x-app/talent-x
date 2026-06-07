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
 * Notifications (device tokens & préférences) — SQUELETTE (TLX-011).
 * Routes câblées sur le contrat ; logique livrée par les tickets dédiés (501).
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  @Post('devices')
  @ApiOperation({ summary: 'Enregistrer un appareil', operationId: 'registerDevice' })
  registerDevice(): never {
    throw new NotImplementedException('registerDevice');
  }

  @Delete('devices/:id')
  @ApiOperation({ summary: 'Révoquer un appareil', operationId: 'revokeDevice' })
  revokeDevice(@Param('id') _id: string): never {
    throw new NotImplementedException('revokeDevice');
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Lire les préférences', operationId: 'getNotificationPreferences' })
  getNotificationPreferences(): never {
    throw new NotImplementedException('getNotificationPreferences');
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Mettre à jour les préférences', operationId: 'updateNotificationPreferences' })
  updateNotificationPreferences(): never {
    throw new NotImplementedException('updateNotificationPreferences');
  }
}
