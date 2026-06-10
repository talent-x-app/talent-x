import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { CompetitionStatus } from './competition-create.dto';

/** Query de `GET /competitions` — pagination commune + filtre `status`. */
export class CompetitionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CompetitionStatus })
  @IsOptional()
  @IsEnum(CompetitionStatus)
  status?: CompetitionStatus;
}
