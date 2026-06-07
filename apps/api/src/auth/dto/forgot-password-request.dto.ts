import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

/** Corps de `POST /auth/forgot-password` — schéma `ForgotPasswordRequest`. */
export class ForgotPasswordRequestDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;
}
