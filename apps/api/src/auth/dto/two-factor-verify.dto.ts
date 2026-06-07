import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Corps de `POST /auth/2fa/verify` — schéma `TwoFactorVerify`. */
export class TwoFactorVerifyDto {
  @ApiProperty()
  @IsString()
  code!: string;
}
