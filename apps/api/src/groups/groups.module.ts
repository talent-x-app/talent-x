import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { AnnouncementsService } from './announcements.service';

// JobsModule : group_update à l'adhésion + group_announcement (ADR-22/46).
// StorageModule : présignature des avatars du roster pair-à-pair (ADR-37).
@Module({
  imports: [JobsModule, StorageModule],
  controllers: [GroupsController],
  providers: [GroupsService, AnnouncementsService],
})
export class GroupsModule {}
