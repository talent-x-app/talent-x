import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { CONSENT_TYPES, type ConsentType } from './consent.dto';

/** Corps de `PUT /users/me/consents` — schéma `ConsentUpdate`. */
export class ConsentUpdateDto {
  @ApiProperty({ enum: CONSENT_TYPES })
  @IsIn(CONSENT_TYPES)
  type!: ConsentType;

  @ApiProperty({ description: 'true = donné, false = retiré.' })
  @IsBoolean()
  granted!: boolean;

  @ApiPropertyOptional({
    description:
      "Version du texte présenté à l'utilisateur. Si absente, la version courante " +
      'côté serveur (CONSENT_TEXT_VERSION) est enregistrée.',
    example: '2026-01',
  })
  @IsOptional()
  @IsString()
  textVersion?: string;
}
