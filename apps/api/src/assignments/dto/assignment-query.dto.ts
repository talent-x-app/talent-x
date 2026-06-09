import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AssignmentStatus } from './assignment.dto';

/** Query de `GET /assignments` — pagination + filtre `status` (contrat `AssignmentStatusFilter`). */
export class AssignmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AssignmentStatus })
  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;
}
