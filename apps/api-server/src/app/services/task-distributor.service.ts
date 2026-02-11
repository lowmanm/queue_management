import { Injectable, Logger, Optional } from '@nestjs/common';
import { Task, TaskAction } from '@nexus-queue/shared-models';
import { ExecutionService } from '../ingestion/execution.service';

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
    @Optional() private readonly executionService?: ExecutionService
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
   *
   * Priority order:
   * 1. Real tasks from the execution pipeline (CSV → Route → Task)
   * 2. Mock-generated tasks as fallback (POC demo mode)
   */
  getNextTaskForAgent(agentId: string): Task | null {
    // First: try to pull a real task from the execution pipeline
    if (this.executionService) {
      const realTask = this.executionService.getNextPendingTask(agentId);
      if (realTask) {
        this.logger.log(
          `Assigned real task ${realTask.id} (${realTask.workType}) to agent ${agentId} — ${this.executionService.getPendingTaskCount()} remaining`
        );
        return realTask;
      }
    }

    // Fallback: generate a mock task (POC demo mode)
    return this.generateTask(agentId);
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

    this.logger.log(`Generated mock task ${taskId} (${template.workType}) for agent ${agentId}`);
    return task;
  }

  /**
   * Get queue statistics (for admin/monitoring)
   */
  getQueueStats(): {
    pendingTasks: number;
    workTypes: Record<string, number>;
  } {
    // If execution service is available, report real stats
    const pendingFromExecution = this.executionService
      ? this.executionService.getPendingTaskCount()
      : 0;

    if (pendingFromExecution > 0) {
      return {
        pendingTasks: pendingFromExecution,
        workTypes: {}, // Detailed breakdown available via ingestion API
      };
    }

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
