import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

/** Corps de `POST /auth/login` — schéma `LoginRequest`. */
export class LoginRequestDto {
  @ApiProperty({ format: 'email', example: 'coach@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecureP@ss123' })
  @IsString()
  password!: string;
}
