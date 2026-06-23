import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementRepliesService } from './announcement-replies.service';
import { TeamPulseService } from './team-pulse.service';

// JobsModule : group_update à l'adhésion + group_announcement/group_reply (ADR-22/46/50).
// StorageModule : présignature des avatars du roster pair-à-pair + auteurs de fil (ADR-37/50).
@Module({
  imports: [JobsModule, StorageModule],
  controllers: [GroupsController],
  providers: [GroupsService, AnnouncementsService, AnnouncementRepliesService, TeamPulseService],
})
export class GroupsModule {}
