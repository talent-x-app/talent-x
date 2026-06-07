import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Corps de `POST /auth/refresh` et `POST /auth/logout` — schéma `RefreshRequest`. */
export class RefreshRequestDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}
