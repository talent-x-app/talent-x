import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { Role } from '../../common/decorators/roles.decorator';

/** Corps de `POST /auth/register` — schéma `RegisterRequest`. */
export class RegisterRequestDto {
  @ApiProperty({ format: 'email', example: 'coach@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'SecureP@ss123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: ['coach', 'athlete'] })
  @IsIn(['coach', 'athlete'])
  role!: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;
}
