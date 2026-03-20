import { Injectable, Logger, Inject, forwardRef, Optional, OnModuleInit } from '@nestjs/common';
import { Task, TaskAction, PendingOrder, RoutingDecision } from '@nexus-queue/shared-models';
import { RuleEngineService } from './rule-engine.service';
import { TaskSourceService } from './task-source.service';
import { RoutingService } from '../routing/routing.service';
import { RedisService } from '../redis';

/** Redis pub/sub channel for cross-instance task distribution signals */
const DISTRIBUTE_CHANNEL = 'nexus:task:distribute';

@Injectable()
export class TaskDistributorService implements OnModuleInit {
  private readonly logger = new Logger(TaskDistributorService.name);

  // Task counter for unique IDs
  private taskCounter = 1000;

  // Last routing decision for debugging/monitoring
  private lastRoutingDecision: RoutingDecision | null = null;

  /** Callback registered by the gateway to attempt assignment when a signal arrives */
  private distributeCallback: ((queueId: string) => void) | null = null;

  constructor(
    @Inject(forwardRef(() => RuleEngineService))
    private readonly ruleEngine: RuleEngineService,
    @Inject(forwardRef(() => TaskSourceService))
    private readonly taskSource: TaskSourceService,
    @Optional()
    @Inject(forwardRef(() => RoutingService))
    private readonly routingService: RoutingService | undefined,
    private readonly redisService: RedisService,
  ) {
    this.logger.log('Task distributor service initialized');
  }

  /**
   * Subscribe to the Redis pub/sub channel so that task distribution
   * signals published by any API instance trigger local distribution attempts.
   */
  onModuleInit(): void {
    this.redisService.subscribe(DISTRIBUTE_CHANNEL, (msg: string) => {
      try {
        const { queueId } = JSON.parse(msg) as { queueId: string; taskId?: string };
        if (this.distributeCallback) {
          this.distributeCallback(queueId);
        }
      } catch {
        this.logger.warn(`Failed to parse distribute message: ${msg}`);
      }
    });

    if (this.redisService.isConnected()) {
      this.logger.log(`Subscribed to Redis channel: ${DISTRIBUTE_CHANNEL}`);
    }
  }

  /**
   * Register the callback (set by AgentGateway) invoked when a distribution
   * signal is received from any instance.
   */
  onDistribute(callback: (queueId: string) => void): void {
    this.distributeCallback = callback;
  }

  /**
   * Publish a distribution signal so all instances know a new task is available.
   * Called by QueueManagerService.enqueue() after a task is persisted.
   */
  async publishDistributeSignal(queueId: string, taskId: string): Promise<void> {
    await this.redisService.publish(
      DISTRIBUTE_CHANNEL,
      JSON.stringify({ queueId, taskId })
    );
  }

  /**
   * Get the next task for a specific agent.
   * Returns tasks from pending orders loaded via Volume Loaders.
   * Returns null if no tasks available.
   */
  getNextTaskForAgent(agentId: string): Task | null {
    if (this.taskSource.hasPendingOrders()) {
      const order = this.taskSource.getNextPendingOrder(agentId);
      if (order && order.taskData) {
        const task = this.createTaskFromOrder(order, agentId);

        const { task: processedTask, results } = this.ruleEngine.evaluateTask(task);

        const matchedRules = results.reduce((sum, r) => sum + r.matchedCount, 0);
        if (matchedRules > 0) {
          this.logger.debug(
            `Applied ${matchedRules} rule(s) to task ${task.id}: priority ${task.priority} → ${processedTask.priority}`
          );
        }

        this.logger.log(`Assigned task ${task.id} to agent ${agentId}`);
        return processedTask;
      }
    }

    return null;
  }

  private createTaskFromOrder(order: PendingOrder, agentId: string): Task {
    const taskData = order.taskData!;
    const now = new Date().toISOString();
    const taskId = `TASK-${++this.taskCounter}`;

    const task: Task = {
      id: taskId,
      externalId: taskData.externalId,
      workType: taskData.workType,
      title: taskData.title,
      description: taskData.description,
      payloadUrl: taskData.payloadUrl,
      metadata: {
        ...taskData.metadata,
        csvRowIndex: String(order.rowIndex),
      },
      priority: taskData.priority,
      skills: taskData.skills,
      queue: taskData.queue,
      status: 'RESERVED',
      createdAt: order.importedAt,
      availableAt: order.importedAt,
      reservedAt: now,
      assignedAgentId: agentId,
      assignmentHistory: [
        {
          agentId,
          assignedAt: now,
        },
      ],
      reservationTimeout: 60,
      actions: this.getDefaultActions(taskData.workType),
    };

    return task;
  }

  private getDefaultActions(workType: string): TaskAction[] {
    return [
      { id: 'complete', label: 'Complete', type: 'COMPLETE', icon: 'check', dispositionCode: 'RESOLVED', primary: true },
      { id: 'transfer', label: 'Transfer', type: 'TRANSFER', icon: 'arrow-right' },
      { id: 'skip', label: 'Skip', type: 'COMPLETE', icon: 'forward', dispositionCode: 'SKIPPED' },
    ];
  }

  getQueueStats(): {
    pendingTasks: number;
    workTypes: Record<string, number>;
  } {
    const stats = this.taskSource.getQueueStats();
    return {
      pendingTasks: stats.totalPending,
      workTypes: {},
    };
  }

  isAgentEligibleForTask(agentId: string, task: Task): boolean {
    if (!this.routingService) {
      return true;
    }

    const decision = this.routingService.routeTask(task);
    this.lastRoutingDecision = decision;

    const agentScore = decision.agentScores.find((s) => s.agentId === agentId);
    return agentScore?.eligible ?? false;
  }

  findBestAgentForTask(task: Task): string | null {
    if (!this.routingService) {
      return null;
    }

    const decision = this.routingService.routeTask(task);
    this.lastRoutingDecision = decision;

    const eligibleAgents = decision.agentScores
      .filter((s) => s.eligible)
      .sort((a, b) => b.totalScore - a.totalScore);

    return eligibleAgents.length > 0 ? eligibleAgents[0].agentId : null;
  }

  getLastRoutingDecision(): RoutingDecision | null {
    return this.lastRoutingDecision;
  }
}
