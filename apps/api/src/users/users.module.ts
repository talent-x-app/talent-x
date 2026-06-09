import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { AccountDeletionService } from './account-deletion.service';
import { ConsentsService } from './consents.service';
import { ExportService } from './export.service';
import { ProfileService } from './profile.service';
import { UsersController } from './users.controller';

@Module({
  imports: [JobsModule, StorageModule],
  controllers: [UsersController],
  providers: [ProfileService, ConsentsService, ExportService, AccountDeletionService],
})
export class UsersModule {}
