import { ApiProperty } from '@nestjs/swagger';

/** Réponse de liveness — schéma `Health` du contrat OpenAPI. */
export class HealthDto {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok';
}
