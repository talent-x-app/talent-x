import { ApiProperty } from '@nestjs/swagger';

/** Réponse de readiness — schéma `Readiness` du contrat OpenAPI. */
export class ReadinessDto {
  @ApiProperty({ enum: ['ready', 'not_ready'] })
  status!: 'ready' | 'not_ready';

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description: 'État de chaque dépendance critique (true = disponible).',
    example: { database: true },
  })
  checks!: Record<string, boolean>;
}
