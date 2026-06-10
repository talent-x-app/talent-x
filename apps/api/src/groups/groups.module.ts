import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

// JobsModule : émission group_update à l'adhésion (ADR-22).
@Module({
  imports: [JobsModule],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
