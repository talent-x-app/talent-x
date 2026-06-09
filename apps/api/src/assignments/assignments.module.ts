import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { PerformancesService } from './performances.service';

@Module({
  controllers: [AssignmentsController],
  providers: [AssignmentsService, PerformancesService],
  exports: [AssignmentsService, PerformancesService],
})
export class AssignmentsModule {}
