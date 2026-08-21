import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { AthleteProgressService } from './athlete-progress.service';
import { CoachInsightsService } from './coach-insights.service';
import { RecordsService } from './records.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  // StorageModule : présignature de l'avatar des athlètes du tableau de bord (ADR-37 §A3, TLX-252).
  imports: [StorageModule],
  controllers: [ProgressController],
  providers: [AthleteProgressService, CoachInsightsService, RecordsService],
  // RecordsService est consommé par AssignmentsModule (détection à la soumission, ADR-20).
  exports: [RecordsService],
})
export class ProgressModule {}
