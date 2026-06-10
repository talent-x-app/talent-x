import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { AthleteProgressService } from './athlete-progress.service';
import { CoachInsightsService } from './coach-insights.service';
import { RecordsService } from './records.service';

@Module({
  controllers: [ProgressController],
  providers: [AthleteProgressService, CoachInsightsService, RecordsService],
  // RecordsService est consommé par AssignmentsModule (détection à la soumission, ADR-20).
  exports: [RecordsService],
})
export class ProgressModule {}
