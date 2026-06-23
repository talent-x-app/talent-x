import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ProgressModule } from '../progress/progress.module';
import { StorageModule } from '../storage/storage.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { PerformancesService } from './performances.service';
import { KudosService } from './kudos.service';
import { TrainingLogController } from './training-log.controller';
import { TrainingLogService } from './training-log.service';

@Module({
  // RecordsService : détection des candidats record à la soumission (ADR-20).
  // JobsModule : émission session_assigned + group_kudos (ADR-22/49).
  // StorageModule : présignature des avatars (TeammatePresenter) pour les kudos nominatifs.
  imports: [ProgressModule, JobsModule, StorageModule],
  controllers: [AssignmentsController, TrainingLogController],
  providers: [AssignmentsService, PerformancesService, KudosService, TrainingLogService],
  exports: [AssignmentsService, PerformancesService],
})
export class AssignmentsModule {}
