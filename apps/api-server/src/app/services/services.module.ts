import { Module } from '@nestjs/common';
import { AgentManagerService } from './agent-manager.service';
import { TaskDistributorService } from './task-distributor.service';

@Module({
  providers: [AgentManagerService, TaskDistributorService],
  exports: [AgentManagerService, TaskDistributorService],
})
export class ServicesModule {}
