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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import {
  DeviceTokenCreateDto,
  DeviceTokenDto,
  NotificationPageDto,
  NotificationPreferencesDto,
  ReadAllResultDto,
} from './dto/notifications.dto';
import { NotificationsService } from './notifications.service';

/** Notifications : feed in-app, device tokens & préférences (TLX-110/111, ADR-22/23). */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Mes notifications in-app', operationId: 'listNotifications' })
  @ApiResponse({ status: 200, description: 'Page + non-lues.', type: NotificationPageDto })
  listNotifications(
    @CurrentUser('id') userId: string,
    @Query() q: PaginationQueryDto,
  ): Promise<NotificationPageDto> {
    return this.notifications.listNotifications(userId, q);
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tout marquer lu', operationId: 'readAllNotifications' })
  @ApiResponse({ status: 200, description: 'Notifications marquées lues.', type: ReadAllResultDto })
  readAllNotifications(@CurrentUser('id') userId: string): Promise<ReadAllResultDto> {
    return this.notifications.readAll(userId);
  }

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
