import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

/**
 * Collaboration (commentaires) — TLX-086. PrismaModule et AuthorizationModule étant
 * globaux, le service s'injecte sans réimport. JobsModule : émission
 * performance_feedback (ADR-22).
 */
@Module({
  imports: [JobsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
