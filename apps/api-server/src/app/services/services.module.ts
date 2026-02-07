import { Module } from '@nestjs/common';
import { AgentManagerService } from './agent-manager.service';
import { TaskDistributorService } from './task-distributor.service';
import { RuleEngineService } from './rule-engine.service';
import { TaskSourceService } from './task-source.service';
import { DispositionService } from './disposition.service';

@Module({
  providers: [
    AgentManagerService,
    TaskDistributorService,
    RuleEngineService,
    TaskSourceService,
    DispositionService,
  ],
  exports: [
    AgentManagerService,
    TaskDistributorService,
    RuleEngineService,
    TaskSourceService,
    DispositionService,
  ],
})
export class ServicesModule {}
