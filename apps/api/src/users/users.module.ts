import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { StorageModule } from '../storage/storage.module';
import { ConsentsService } from './consents.service';
import { ExportService } from './export.service';
import { UsersController } from './users.controller';

@Module({
  imports: [JobsModule, StorageModule],
  controllers: [UsersController],
  providers: [ConsentsService, ExportService],
})
export class UsersModule {}
