import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';

@Module({
  controllers: [AssignmentsController],
})
export class AssignmentsModule {}
