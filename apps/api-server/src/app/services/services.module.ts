import { Module, forwardRef } from '@nestjs/common';
import { AgentManagerService } from './agent-manager.service';
import { TaskDistributorService } from './task-distributor.service';
import { RuleEngineService } from './rule-engine.service';
import { TaskSourceService } from './task-source.service';
import { DispositionService } from './disposition.service';
import { RbacService } from './rbac.service';
import { QueuesService } from '../queues/queues.service';

@Module({
  providers: [
    AgentManagerService,
    TaskDistributorService,
    RuleEngineService,
    TaskSourceService,
    DispositionService,
    RbacService,
    QueuesService,
  ],
  exports: [
    AgentManagerService,
    TaskDistributorService,
    RuleEngineService,
    TaskSourceService,
    DispositionService,
    RbacService,
    QueuesService,
  ],
})
export class ServicesModule {}
