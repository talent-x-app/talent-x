import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Role } from '../../common/decorators/roles.decorator';

/** Profil utilisateur — schéma `User` du contrat OpenAPI. */
export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email' })
  email!: string;

  @ApiProperty({ enum: ['coach', 'athlete'] })
  role!: Role;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional({ format: 'uri' })
  photoUrl?: string;

  @ApiPropertyOptional()
  sport?: string;

  @ApiPropertyOptional()
  bio?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  createdAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  updatedAt?: string;
}
