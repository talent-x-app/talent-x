import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

/**
 * Collaboration (commentaires) — TLX-086. PrismaModule et AuthorizationModule étant
 * globaux, le service s'injecte sans réimport.
 */
@Module({
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
