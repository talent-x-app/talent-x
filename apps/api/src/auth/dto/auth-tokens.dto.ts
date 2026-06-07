import { ApiProperty } from '@nestjs/swagger';

/** Réponse jetons — schéma `AuthTokens`. */
export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ description: "Durée de vie de l'access token, en secondes." })
  expiresIn!: number;
}
