import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { CoachInsightsService } from './coach-insights.service';

@Module({
  controllers: [ProgressController],
  providers: [CoachInsightsService],
})
export class ProgressModule {}
