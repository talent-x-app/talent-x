import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageMetaDto } from '../../common/pagination/page-meta';
import { SessionDto } from '../../sessions/dto/session.dto';

/** Statut d'une affectation — schéma `AssignmentStatus`. */
export enum AssignmentStatus {
  Assigned = 'assigned',
  InProgress = 'in_progress',
  Completed = 'completed',
  Skipped = 'skipped',
}

/** Affectation d'une séance à un athlète — schéma `Assignment`. */
export class AssignmentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  sessionId!: string;

  @ApiProperty({ format: 'uuid' })
  athleteId!: string;

  @ApiProperty({ enum: AssignmentStatus })
  status!: AssignmentStatus;

  @ApiPropertyOptional({ format: 'date' })
  dueDate?: string;

  @ApiPropertyOptional({ type: SessionDto, description: 'Séance embarquée (lectures détaillées).' })
  session?: SessionDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

/** Liste simple d'affectations — schéma `AssignmentList` (réponse de `assign`). */
export class AssignmentListDto {
  @ApiProperty({ type: [AssignmentDto] })
  data!: AssignmentDto[];
}

/** Page d'affectations — schéma `AssignmentPage`. */
export class AssignmentPageDto {
  @ApiProperty({ type: [AssignmentDto] })
  data!: AssignmentDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
