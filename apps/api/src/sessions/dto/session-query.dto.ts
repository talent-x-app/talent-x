import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SessionStatus } from './session-create.dto';

/** Query de `GET /sessions` — pagination commune + filtre `status` (contrat `SessionStatusFilter`). */
export class SessionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SessionStatus })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
}
