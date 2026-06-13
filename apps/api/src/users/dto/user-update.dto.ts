import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Corps de `PUT /users/me` — schéma `UserUpdate` du contrat OpenAPI.
 *
 * Tous les champs sont optionnels : sémantique PATCH sur un PUT (le contrat
 * n'exige aucun champ). Les champs absents restent inchangés ; `email` et `role`
 * ne sont volontairement pas modifiables ici (identité / autorisation). La photo
 * de profil (`photoUrl`) n'est pas éditable ici (TLX-124) : elle se gère via les
 * endpoints avatar dédiés (`/users/me/avatar`), qui stockent une clé objet S3.
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
