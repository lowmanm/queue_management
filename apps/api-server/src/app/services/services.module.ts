import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { PipelineMetricsService } from './pipeline-metrics.service';
import { EventStoreService } from './event-store.service';
import { PipelineModule } from '../pipelines/pipeline.module';
import {
  TaskEntity,
  QueuedTaskEntity,
  DLQEntryEntity,
  DispositionEntity,
  TaskCompletionEntity,
  RuleSetEntity,
  UserEntity,
  TeamEntity,
  TaskSourceEntity,
  SkillEntity,
  AgentSkillEntity,
  TaskEventEntity,
} from '../entities';

@Module({
  imports: [
    forwardRef(() => PipelineModule),
    TypeOrmModule.forFeature([
      TaskEntity,
      QueuedTaskEntity,
      DLQEntryEntity,
      DispositionEntity,
      TaskCompletionEntity,
      RuleSetEntity,
      UserEntity,
      TeamEntity,
      TaskSourceEntity,
      SkillEntity,
      AgentSkillEntity,
      TaskEventEntity,
    ]),
  ],
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
    // Phase 3 services
    PipelineMetricsService,
    // Phase 4 services
    EventStoreService,
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
    // Phase 3 services
    PipelineMetricsService,
    // Phase 4 services
    EventStoreService,
  ],
})
export class ServicesModule {}
