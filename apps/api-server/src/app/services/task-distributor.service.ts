import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Task, TaskAction, PendingOrder } from '@nexus-queue/shared-models';
import { RuleEngineService } from './rule-engine.service';
import { TaskSourceService } from './task-source.service';

interface MockTaskTemplate {
  workType: string;
  titlePrefix: string;
  description: string;
  payloadUrl: string;
  priority: number;
  skills: string[];
  queue: string;
  reservationTimeout: number;
  actions: TaskAction[];
  metadataGenerator: () => Record<string, string>;
}

@Injectable()
export class TaskDistributorService {
  private readonly logger = new Logger(TaskDistributorService.name);

  // Task counter for unique IDs
  private taskCounter = 1000;

  constructor(
    @Inject(forwardRef(() => RuleEngineService))
    private readonly ruleEngine: RuleEngineService,
    @Inject(forwardRef(() => TaskSourceService))
    private readonly taskSource: TaskSourceService
  ) {}

  // Mock task templates
  private readonly taskTemplates: MockTaskTemplate[] = [
    {
      workType: 'ORDERS',
      titlePrefix: 'Process Order',
      description: 'Customer order requiring fulfillment review',
      payloadUrl: 'https://www.wikipedia.org',
      priority: 1,
      skills: ['orders', 'fulfillment'],
      queue: 'orders-priority',
      reservationTimeout: 30,
      actions: [
        { id: 'complete', label: 'Complete', type: 'COMPLETE', icon: 'check', dispositionCode: 'RESOLVED', primary: true },
        { id: 'transfer', label: 'Transfer', type: 'TRANSFER', icon: 'arrow-right' },
        { id: 'kb', label: 'Knowledge Base', type: 'LINK', icon: 'book', url: 'https://kb.example.com/orders' },
      ],
      metadataGenerator: () => ({
        orderId: `ORD-${Math.floor(Math.random() * 90000) + 10000}`,
        customerId: `CUST-${Math.floor(Math.random() * 9000) + 1000}`,
        region: ['WEST', 'EAST', 'CENTRAL', 'SOUTH'][Math.floor(Math.random() * 4)],
        orderTotal: `$${(Math.random() * 500 + 50).toFixed(2)}`,
      }),
    },
    {
      workType: 'RETURNS',
      titlePrefix: 'Return Request',
      description: 'Customer return requiring authorization',
      payloadUrl: 'https://www.wikipedia.org',
      priority: 2,
      skills: ['returns', 'customer-service'],
      queue: 'returns-standard',
      reservationTimeout: 45,
      actions: [
        { id: 'approve', label: 'Approve Return', type: 'COMPLETE', icon: 'check', dispositionCode: 'APPROVED', primary: true },
        { id: 'deny', label: 'Deny Return', type: 'COMPLETE', icon: 'x', dispositionCode: 'DENIED' },
        { id: 'escalate', label: 'Escalate', type: 'TRANSFER', icon: 'arrow-up' },
      ],
      metadataGenerator: () => ({
        returnId: `RTN-${Math.floor(Math.random() * 9000) + 1000}`,
        originalOrderId: `ORD-${Math.floor(Math.random() * 90000) + 10000}`,
        reason: ['DEFECTIVE', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'CHANGED_MIND'][Math.floor(Math.random() * 4)],
        returnValue: `$${(Math.random() * 200 + 20).toFixed(2)}`,
      }),
    },
    {
      workType: 'CLAIMS',
      titlePrefix: 'Insurance Claim',
      description: 'Damage claim requiring investigation',
      payloadUrl: 'https://www.wikipedia.org',
      priority: 3,
      skills: ['claims', 'investigation'],
      queue: 'claims-review',
      reservationTimeout: 60,
      actions: [
        { id: 'approve', label: 'Approve Claim', type: 'COMPLETE', icon: 'check', dispositionCode: 'CLAIM_APPROVED', primary: true },
        { id: 'partial', label: 'Partial Approval', type: 'COMPLETE', icon: 'minus', dispositionCode: 'CLAIM_PARTIAL' },
        { id: 'deny', label: 'Deny Claim', type: 'COMPLETE', icon: 'x', dispositionCode: 'CLAIM_DENIED' },
        { id: 'investigate', label: 'Request Investigation', type: 'TRANSFER', icon: 'search' },
      ],
      metadataGenerator: () => ({
        claimId: `CLM-${Math.floor(Math.random() * 9000) + 1000}`,
        claimType: ['SHIPPING_DAMAGE', 'LOST_PACKAGE', 'THEFT', 'WATER_DAMAGE'][Math.floor(Math.random() * 4)],
        claimAmount: `$${(Math.random() * 1000 + 50).toFixed(2)}`,
        filedDate: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }),
    },
  ];

  /**
   * Get the next task for a specific agent.
   * Priority:
   * 1. Check for pending orders from CSV upload
   * 2. Fall back to generated mock tasks
   */
  getNextTaskForAgent(agentId: string): Task | null {
    // Check for pending orders from CSV first
    if (this.taskSource.hasPendingOrders()) {
      const order = this.taskSource.getNextPendingOrder(agentId);
      if (order && order.taskData) {
        const task = this.createTaskFromOrder(order, agentId);

        // Apply rules to the task
        const { task: processedTask, results } = this.ruleEngine.evaluateTask(task);

        const matchedRules = results.reduce((sum, r) => sum + r.matchedCount, 0);
        if (matchedRules > 0) {
          this.logger.debug(
            `Applied ${matchedRules} rule(s) to CSV task ${task.id}: priority ${task.priority} → ${processedTask.priority}`
          );
        }

        this.logger.log(`Assigned CSV order ${order.rowIndex} as task ${task.id} to agent ${agentId}`);
        return processedTask;
      }
    }

    // Fall back to generated task
    const task = this.generateTask(agentId);

    // Apply rules to the task
    const { task: processedTask, results } = this.ruleEngine.evaluateTask(task);

    // Log rule evaluation results
    const matchedRules = results.reduce((sum, r) => sum + r.matchedCount, 0);
    if (matchedRules > 0) {
      this.logger.debug(
        `Applied ${matchedRules} rule(s) to task ${task.id}: priority ${task.priority} → ${processedTask.priority}, queue: ${processedTask.queue}`
      );
    }

    return processedTask;
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
   * Generate a mock task
   */
  private generateTask(agentId: string): Task {
    // Rotate through templates
    const templateIndex = this.taskCounter % this.taskTemplates.length;
    const template = this.taskTemplates[templateIndex];

    const now = new Date().toISOString();
    const createdAt = new Date(Date.now() - Math.random() * 10 * 60 * 1000).toISOString(); // 0-10 min ago

    const taskId = `TASK-${++this.taskCounter}`;
    const externalId = `EXT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const task: Task = {
      id: taskId,
      externalId,
      workType: template.workType,
      title: `${template.titlePrefix} #${Math.floor(Math.random() * 90000) + 10000}`,
      description: template.description,
      payloadUrl: template.payloadUrl,
      metadata: template.metadataGenerator(),
      priority: template.priority,
      skills: template.skills,
      queue: template.queue,
      status: 'RESERVED',
      createdAt,
      availableAt: createdAt,
      reservedAt: now,
      assignedAgentId: agentId,
      assignmentHistory: [
        {
          agentId,
          assignedAt: now,
        },
      ],
      reservationTimeout: template.reservationTimeout,
      actions: template.actions,
    };

    this.logger.log(`Generated task ${taskId} (${template.workType}) for agent ${agentId}`);
    return task;
  }

  /**
   * Get queue statistics (for admin/monitoring)
   */
  getQueueStats(): {
    pendingTasks: number;
    workTypes: Record<string, number>;
  } {
    // Mock stats for POC
    return {
      pendingTasks: Math.floor(Math.random() * 50) + 10,
      workTypes: {
        ORDERS: Math.floor(Math.random() * 20) + 5,
        RETURNS: Math.floor(Math.random() * 15) + 3,
        CLAIMS: Math.floor(Math.random() * 10) + 2,
      },
    };
  }
}
