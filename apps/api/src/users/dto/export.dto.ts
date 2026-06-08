import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Statuts exposés par l'API — schéma `Job.status` du contrat OpenAPI. */
export const JOB_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Réponse de `POST /users/me/export` — schéma `Job` du contrat. */
export class JobDto {
  @ApiProperty({ format: 'uuid' })
  jobId!: string;

  @ApiProperty({ enum: JOB_STATUSES })
  status!: JobStatus;
}

/** Réponse de `GET /users/me/export/{jobId}` — schéma `ExportJob` du contrat. */
export class ExportJobDto extends JobDto {
  @ApiPropertyOptional({ format: 'uri', description: 'URL présignée (présente si status=ready).' })
  downloadUrl?: string;

  @ApiPropertyOptional({ format: 'date-time', description: "Expiration de l'archive." })
  expiresAt?: string;
}
