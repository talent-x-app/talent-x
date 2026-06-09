import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

/**
 * Query de `GET /comments` — pagination commune + filtre de cible. Exactement une
 * cible (`sessionId` OU `performanceId`) est requise (400 sinon, vérifié au service).
 */
export class CommentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  performanceId?: string;
}
