import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { ProgressModule } from '../progress/progress.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { PerformancesService } from './performances.service';

@Module({
  // RecordsService : détection des candidats record à la soumission (ADR-20).
  // JobsModule : émission session_assigned (ADR-22).
  imports: [ProgressModule, JobsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, PerformancesService],
  exports: [AssignmentsService, PerformancesService],
})
export class AssignmentsModule {}
