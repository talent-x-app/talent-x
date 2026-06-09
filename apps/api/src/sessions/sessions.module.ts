import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [AssignmentsModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
