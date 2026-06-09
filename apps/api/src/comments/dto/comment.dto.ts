import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PageMetaDto } from '../../common/pagination/page-meta';

/** Commentaire rattaché à une séance ou une performance — schéma `Comment`. */
export class CommentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  authorId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  sessionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  performanceId?: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** Liste paginée de commentaires — schéma `CommentPage`. */
export class CommentPageDto {
  @ApiProperty({ type: [CommentDto] })
  data!: CommentDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
