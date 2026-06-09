import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageMetaDto } from '../../common/pagination/page-meta';
import { ExercisesDocDto } from './exercises.dto';
import { SessionStatus } from './session-create.dto';

/** Séance — schéma `Session` du contrat OpenAPI. */
export class SessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional({ format: 'date' })
  scheduledDate?: string;

  @ApiProperty({ enum: SessionStatus })
  status!: SessionStatus;

  @ApiProperty({ format: 'uuid' })
  coachId!: string;

  @ApiProperty({ type: ExercisesDocDto })
  exercises!: ExercisesDocDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

/** Page de séances — schéma `SessionPage`. */
export class SessionPageDto {
  @ApiProperty({ type: [SessionDto] })
  data!: SessionDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
