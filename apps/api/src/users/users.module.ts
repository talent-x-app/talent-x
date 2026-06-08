import { Module } from '@nestjs/common';
import { ConsentsService } from './consents.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [ConsentsService],
})
export class UsersModule {}
