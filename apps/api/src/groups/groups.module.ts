import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

// JobsModule : émission group_update à l'adhésion (ADR-22).
// StorageModule : présignature des avatars du roster pair-à-pair (ADR-37).
@Module({
  imports: [JobsModule, StorageModule],
  controllers: [GroupsController],
  providers: [GroupsService],
})
export class GroupsModule {}
