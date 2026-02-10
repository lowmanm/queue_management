import { Module, forwardRef } from '@nestjs/common';
import { AgentManagerService } from './agent-manager.service';
import { TaskDistributorService } from './task-distributor.service';
import { RuleEngineService } from './rule-engine.service';
import { TaskSourceService } from './task-source.service';
import { DispositionService } from './disposition.service';
import { RbacService } from './rbac.service';
import { AgentSessionService } from './agent-session.service';
import { QueuesService } from '../queues/queues.service';
import { RoutingService } from '../routing/routing.service';
import { TaskStoreService } from './task-store.service';
import { QueueManagerService } from './queue-manager.service';
import { PipelineOrchestratorService } from './pipeline-orchestrator.service';
import { SLAMonitorService } from './sla-monitor.service';
import { PipelineModule } from '../pipelines/pipeline.module';

@Module({
  imports: [forwardRef(() => PipelineModule)],
  providers: [
    AgentManagerService,
    TaskDistributorService,
    RuleEngineService,
    TaskSourceService,
    DispositionService,
    RbacService,
    AgentSessionService,
    QueuesService,
    RoutingService,
    // V2 Orchestration services
    TaskStoreService,
    QueueManagerService,
    PipelineOrchestratorService,
    SLAMonitorService,
  ],
  exports: [
    AgentManagerService,
    TaskDistributorService,
    RuleEngineService,
    TaskSourceService,
    DispositionService,
    RbacService,
    AgentSessionService,
    QueuesService,
    RoutingService,
    // V2 Orchestration services
    TaskStoreService,
    QueueManagerService,
    PipelineOrchestratorService,
    SLAMonitorService,
  ],
})
export class ServicesModule {}
