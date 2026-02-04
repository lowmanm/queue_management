import { Injectable } from '@nestjs/common';
import { Task } from '@nexus-queue/shared-models';

@Injectable()
export class TasksService {
  // Mock task counter for generating unique IDs
  private taskCounter = 1000;

  // Mock task pool for demonstration
  private readonly mockTasks: Partial<Task>[] = [
    {
      workType: 'ORDERS',
      title: 'Process Order #55123',
      description: 'Customer order requiring fulfillment review',
      payloadUrl: 'https://www.wikipedia.org',
      priority: 1,
      skills: ['orders', 'fulfillment'],
      queue: 'orders-priority',
      metadata: {
        orderId: '55123',
        customerId: 'CUST-9876',
        region: 'WEST',
      },
      reservationTimeout: 30,
      actions: [
        {
          id: 'complete',
          label: 'Complete',
          type: 'COMPLETE',
          icon: 'check',
          dispositionCode: 'RESOLVED',
          primary: true,
        },
        {
          id: 'transfer',
          label: 'Transfer',
          type: 'TRANSFER',
          icon: 'arrow-right',
        },
        {
          id: 'kb',
          label: 'Knowledge Base',
          type: 'LINK',
          icon: 'book',
          url: 'https://kb.example.com/orders',
        },
      ],
    },
    {
      workType: 'RETURNS',
      title: 'Return Request #RTN-2024',
      description: 'Customer return requiring authorization',
      payloadUrl: 'https://www.wikipedia.org',
      priority: 2,
      skills: ['returns', 'customer-service'],
      queue: 'returns-standard',
      metadata: {
        returnId: 'RTN-2024',
        originalOrderId: '54999',
        reason: 'DEFECTIVE',
      },
      reservationTimeout: 45,
      actions: [
        {
          id: 'approve',
          label: 'Approve Return',
          type: 'COMPLETE',
          icon: 'check',
          dispositionCode: 'APPROVED',
          primary: true,
        },
        {
          id: 'deny',
          label: 'Deny Return',
          type: 'COMPLETE',
          icon: 'x',
          dispositionCode: 'DENIED',
        },
        {
          id: 'escalate',
          label: 'Escalate',
          type: 'TRANSFER',
          icon: 'arrow-up',
        },
      ],
    },
    {
      workType: 'CLAIMS',
      title: 'Insurance Claim #CLM-8847',
      description: 'Damage claim requiring investigation',
      payloadUrl: 'https://www.wikipedia.org',
      priority: 3,
      skills: ['claims', 'investigation'],
      queue: 'claims-review',
      metadata: {
        claimId: 'CLM-8847',
        claimType: 'SHIPPING_DAMAGE',
        amount: '245.99',
      },
      reservationTimeout: 60,
      actions: [
        {
          id: 'approve',
          label: 'Approve Claim',
          type: 'COMPLETE',
          icon: 'check',
          dispositionCode: 'CLAIM_APPROVED',
          primary: true,
        },
        {
          id: 'partial',
          label: 'Partial Approval',
          type: 'COMPLETE',
          icon: 'minus',
          dispositionCode: 'CLAIM_PARTIAL',
        },
        {
          id: 'deny',
          label: 'Deny Claim',
          type: 'COMPLETE',
          icon: 'x',
          dispositionCode: 'CLAIM_DENIED',
        },
        {
          id: 'investigate',
          label: 'Request Investigation',
          type: 'TRANSFER',
          icon: 'search',
        },
      ],
    },
  ];

  /**
   * Returns the next available task.
   * In a real implementation, this would query the database
   * and apply routing logic based on agent skills and task priority.
   */
  getNextTask(agentId?: string): Task {
    // Rotate through mock tasks for variety
    const mockIndex = this.taskCounter % this.mockTasks.length;
    const mockTask = this.mockTasks[mockIndex];

    const now = new Date().toISOString();
    const createdAt = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago

    const task: Task = {
      id: `TASK-${++this.taskCounter}`,
      externalId: `EXT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      workType: mockTask.workType || 'GENERAL',
      title: mockTask.title || 'Untitled Task',
      description: mockTask.description,
      payloadUrl: mockTask.payloadUrl || 'https://www.wikipedia.org',
      metadata: mockTask.metadata,
      priority: mockTask.priority || 5,
      skills: mockTask.skills,
      queue: mockTask.queue,
      status: 'RESERVED',
      createdAt,
      availableAt: createdAt,
      reservedAt: now,
      assignedAgentId: agentId,
      assignmentHistory: agentId
        ? [
            {
              agentId,
              assignedAt: now,
            },
          ]
        : undefined,
      reservationTimeout: mockTask.reservationTimeout || 30,
      actions: mockTask.actions,
    };

    return task;
  }

  /**
   * Updates a task's status and timestamps.
   * Mock implementation - would update database in production.
   */
  updateTaskStatus(
    taskId: string,
    status: Task['status'],
    agentId: string
  ): Partial<Task> {
    const now = new Date().toISOString();

    const updates: Partial<Task> = {
      status,
    };

    switch (status) {
      case 'ACTIVE':
        updates.acceptedAt = now;
        updates.startedAt = now;
        break;
      case 'WRAP_UP':
        updates.completedAt = now;
        break;
      case 'COMPLETED':
        updates.dispositionedAt = now;
        break;
    }

    return updates;
  }
}
