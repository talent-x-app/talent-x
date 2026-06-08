import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Types de consentement — schéma `ConsentType` du contrat OpenAPI (et CHECK base). */
export const CONSENT_TYPES = ['data_processing', 'coach_access', 'marketing'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** État courant d'un consentement — schéma `Consent` du contrat OpenAPI. */
export class ConsentDto {
  @ApiProperty({ enum: CONSENT_TYPES })
  type!: ConsentType;

  @ApiProperty()
  granted!: boolean;

  @ApiPropertyOptional()
  textVersion?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  updatedAt?: string;
}

/** Réponse de `GET /users/me/consents` — schéma `ConsentList`. */
export class ConsentListDto {
  @ApiProperty({ type: [ConsentDto] })
  data!: ConsentDto[];
}
