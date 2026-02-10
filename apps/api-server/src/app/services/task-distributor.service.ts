import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import { Task, TaskAction, PendingOrder, RoutingDecision } from '@nexus-queue/shared-models';
import { RuleEngineService } from './rule-engine.service';
import { TaskSourceService } from './task-source.service';
import { RoutingService } from '../routing/routing.service';

@Injectable()
export class TaskDistributorService {
  private readonly logger = new Logger(TaskDistributorService.name);

  // Task counter for unique IDs
  private taskCounter = 1000;

  // Last routing decision for debugging/monitoring
  private lastRoutingDecision: RoutingDecision | null = null;

  constructor(
    @Inject(forwardRef(() => RuleEngineService))
    private readonly ruleEngine: RuleEngineService,
    @Inject(forwardRef(() => TaskSourceService))
    private readonly taskSource: TaskSourceService,
    @Optional()
    @Inject(forwardRef(() => RoutingService))
    private readonly routingService?: RoutingService
  ) {
    this.logger.log('Task distributor service initialized (no mock tasks)');
  }

  /**
   * Get the next task for a specific agent.
   * Returns tasks from pending orders loaded via Volume Loaders.
   * Returns null if no tasks available.
   */
  getNextTaskForAgent(agentId: string): Task | null {
    // Check for pending orders from data sources
    if (this.taskSource.hasPendingOrders()) {
      const order = this.taskSource.getNextPendingOrder(agentId);
      if (order && order.taskData) {
        const task = this.createTaskFromOrder(order, agentId);

        // Apply rules to the task
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

    // No tasks available
    return null;
  }

  /**
   * Create a Task from a PendingOrder
   */
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

  /**
   * Get default actions based on work type
   */
  private getDefaultActions(workType: string): TaskAction[] {
    return [
      { id: 'complete', label: 'Complete', type: 'COMPLETE', icon: 'check', dispositionCode: 'RESOLVED', primary: true },
      { id: 'transfer', label: 'Transfer', type: 'TRANSFER', icon: 'arrow-right' },
      { id: 'skip', label: 'Skip', type: 'COMPLETE', icon: 'forward', dispositionCode: 'SKIPPED' },
    ];
  }

  /**
   * Get queue statistics
   */
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

  /**
   * Check if an agent is eligible for a task based on skill-based routing
   * Returns true if the agent has the required skills, or if routing is disabled
   */
  isAgentEligibleForTask(agentId: string, task: Task): boolean {
    if (!this.routingService) {
      return true; // Routing disabled, allow all
    }

    const decision = this.routingService.routeTask(task);
    this.lastRoutingDecision = decision;

    // Check if the agent is in the eligible list
    const agentScore = decision.agentScores.find((s) => s.agentId === agentId);
    return agentScore?.eligible ?? false;
  }

  /**
   * Get the best agent for a task using skill-based routing
   * Returns the agent ID or null if no suitable agent found
   */
  findBestAgentForTask(task: Task): string | null {
    if (!this.routingService) {
      return null; // Routing disabled
    }

    const decision = this.routingService.routeTask(task);
    this.lastRoutingDecision = decision;

    // Return the best agent (highest score among eligible agents)
    const eligibleAgents = decision.agentScores
      .filter((s) => s.eligible)
      .sort((a, b) => b.totalScore - a.totalScore);

    return eligibleAgents.length > 0 ? eligibleAgents[0].agentId : null;
  }

  /**
   * Get the last routing decision (for debugging/monitoring)
   */
  getLastRoutingDecision(): RoutingDecision | null {
    return this.lastRoutingDecision;
  }
}
