import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  DeviceTokenCreateDto,
  DeviceTokenDto,
  NotificationPreferencesDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/** Notifications : device tokens & préférences (TLX-110, ADR-22). */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('devices')
  @ApiOperation({ summary: 'Enregistrer un appareil', operationId: 'registerDevice' })
  @ApiResponse({ status: 201, description: 'Device enregistré.', type: DeviceTokenDto })
  registerDevice(
    @CurrentUser('id') userId: string,
    @Body() dto: DeviceTokenCreateDto,
  ): Promise<DeviceTokenDto> {
    return this.notifications.registerDevice(userId, dto);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Révoquer un appareil', operationId: 'revokeDevice' })
  @ApiResponse({ status: 204, description: 'Device révoqué.' })
  revokeDevice(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.notifications.revokeDevice(userId, id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Lire les préférences', operationId: 'getNotificationPreferences' })
  @ApiResponse({ status: 200, description: 'Préférences.', type: NotificationPreferencesDto })
  getNotificationPreferences(
    @CurrentUser('id') userId: string,
  ): Promise<NotificationPreferencesDto> {
    return this.notifications.getPreferences(userId);
  }

  @Put('preferences')
  @ApiOperation({
    summary: 'Mettre à jour les préférences',
    operationId: 'updateNotificationPreferences',
  })
  @ApiResponse({
    status: 200,
    description: 'Préférences mises à jour.',
    type: NotificationPreferencesDto,
  })
  updateNotificationPreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesDto> {
    return this.notifications.updatePreferences(userId, dto);
  }
}
