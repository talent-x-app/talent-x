import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * Corps de `PUT /users/me` — schéma `UserUpdate` du contrat OpenAPI.
 *
 * Tous les champs sont optionnels : sémantique PATCH sur un PUT (le contrat
 * n'exige aucun champ). Les champs absents restent inchangés ; `email` et `role`
 * ne sont volontairement pas modifiables ici (identité / autorisation).
 */
export class UserUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ format: 'uri' })
  @IsOptional()
  @IsUrl()
  @MaxLength(2048)
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sport?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;
}
