import { Module } from '@nestjs/common';
import { AgentManagerService } from './agent-manager.service';
import { TaskDistributorService } from './task-distributor.service';
import { RuleEngineService } from './rule-engine.service';

@Module({
  providers: [AgentManagerService, TaskDistributorService, RuleEngineService],
  exports: [AgentManagerService, TaskDistributorService, RuleEngineService],
})
export class ServicesModule {}
