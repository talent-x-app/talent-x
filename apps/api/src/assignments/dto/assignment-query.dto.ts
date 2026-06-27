import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AssignmentStatus } from './assignment.dto';

/**
 * Query de `GET /assignments` — pagination + filtre `status` (contrat `AssignmentStatusFilter`) +
 * filtre `sessionId` (TLX-193 : restreindre aux affectations d'une séance — le coach affiche
 * « Assigné à » sur le détail de séance). Le scope d'autorisation reste appliqué (coach → ses
 * séances, athlète → ses affectations) ; `sessionId` ne fait que restreindre à l'intérieur.
 */
export class AssignmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AssignmentStatus })
  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Restreindre aux affectations de cette séance.',
  })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}
