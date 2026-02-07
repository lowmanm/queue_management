import { Module } from '@nestjs/common';
import { AgentManagerService } from './agent-manager.service';
import { TaskDistributorService } from './task-distributor.service';
import { RuleEngineService } from './rule-engine.service';
import { TaskSourceService } from './task-source.service';
import { DispositionService } from './disposition.service';
import { RbacService } from './rbac.service';

@Module({
  providers: [
    AgentManagerService,
    TaskDistributorService,
    RuleEngineService,
    TaskSourceService,
    DispositionService,
    RbacService,
  ],
  exports: [
    AgentManagerService,
    TaskDistributorService,
    RuleEngineService,
    TaskSourceService,
    DispositionService,
    RbacService,
  ],
})
export class ServicesModule {}
