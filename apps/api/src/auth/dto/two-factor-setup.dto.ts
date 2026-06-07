import { ApiPropertyOptional } from '@nestjs/swagger';

/** Réponse d'activation 2FA — schéma `TwoFactorSetup` (V2). */
export class TwoFactorSetupDto {
  @ApiPropertyOptional()
  otpauthUrl?: string;

  @ApiPropertyOptional()
  secret?: string;
}
