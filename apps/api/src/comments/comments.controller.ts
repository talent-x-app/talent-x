import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { CommentCreateDto } from './dto/comment-create.dto';
import { CommentDto, CommentPageDto } from './dto/comment.dto';
import { CommentQueryDto } from './dto/comment-query.dto';

/**
 * Collaboration (commentaires) — TLX-086 / carte C-08. Permet au coach de poser un
 * feedback sur une performance (la sortant de « à revoir ») ou une séance, et à
 * l'athlète de commenter ses propres cibles. Autorisation : partie liée à la cible
 * (cf. CommentsService).
 */
@ApiTags('Collaboration')
@ApiBearerAuth()
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({
    summary: 'Commenter une séance ou une performance',
    operationId: 'createComment',
  })
  @ApiResponse({ status: 201, description: 'Commentaire créé.', type: CommentDto })
  createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CommentCreateDto,
  ): Promise<CommentDto> {
    return this.comments.createComment(user, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lister les commentaires d'une cible", operationId: 'listComments' })
  @ApiResponse({
    status: 200,
    description: 'Liste paginée des commentaires.',
    type: CommentPageDto,
  })
  listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: CommentQueryDto,
  ): Promise<CommentPageDto> {
    return this.comments.listComments(user, query);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer son commentaire', operationId: 'deleteComment' })
  @ApiResponse({ status: 204, description: 'Commentaire supprimé.' })
  deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    return this.comments.deleteComment(user, id);
  }
}
