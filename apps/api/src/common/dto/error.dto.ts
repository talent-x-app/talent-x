import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Détail de validation — schéma `ValidationDetail` du contrat OpenAPI.
 */
export class ValidationDetailDto {
  @ApiPropertyOptional()
  field?: string;

  @ApiPropertyOptional()
  constraint?: string;

  @ApiPropertyOptional()
  message?: string;
}

/**
 * Enveloppe d'erreur normalisée — schéma `Error` du contrat OpenAPI.
 * Toutes les réponses d'erreur de l'API suivent cette forme (cf. AllExceptionsFilter).
 */
export class ErrorDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    description: "Code d'erreur stable et exploitable côté client.",
    example: 'BAD_REQUEST',
  })
  error!: string;

  @ApiProperty({ example: 'Invalid request' })
  message!: string;

  @ApiPropertyOptional({ type: [ValidationDetailDto] })
  details?: ValidationDetailDto[];

  @ApiPropertyOptional({ format: 'date-time' })
  timestamp?: string;

  @ApiPropertyOptional()
  path?: string;
}
