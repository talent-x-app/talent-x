import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Corps optionnel de `POST /auth/logout` (requestBody required:false).
 * Le refresh token peut aussi être transmis hors corps (cookie/header).
 */
export class LogoutRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
