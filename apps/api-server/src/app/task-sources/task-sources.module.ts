import { Module } from '@nestjs/common';
import { TaskSourcesController } from './task-sources.controller';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [ServicesModule],
  controllers: [TaskSourcesController],
})
export class TaskSourcesModule {}
