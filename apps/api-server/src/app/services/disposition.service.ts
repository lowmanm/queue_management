import { Injectable, Logger } from '@nestjs/common';
import {
  Disposition,
  DispositionCategory,
  CreateDispositionRequest,
  UpdateDispositionRequest,
  Queue,
  WorkType,
  TaskCompletion,
  CompleteTaskRequest,
  DispositionConfig,
  DispositionStats,
  DISPOSITION_CATEGORIES,
} from '@nexus-queue/shared-models';

@Injectable()
export class DispositionService {
  private readonly logger = new Logger(DispositionService.name);

  // In-memory storage (would be database in production)
  private dispositions: Map<string, Disposition> = new Map();
  private queues: Map<string, Queue> = new Map();
  private workTypes: Map<string, WorkType> = new Map();
  private completions: TaskCompletion[] = [];

  constructor() {
    this.initializeDefaults();
  }

  /**
   * Initialize with default dispositions, queues, and work types
   */
  private initializeDefaults(): void {
    const now = new Date().toISOString();

    // Default Work Types
    const defaultWorkTypes: WorkType[] = [
      {
        id: 'wt-orders',
        code: 'ORDERS',
        name: 'Order Processing',
        description: 'Customer orders requiring fulfillment review',
        active: true,
        defaultHandleTime: 180,
        color: '#1565c0',
        icon: 'shopping-cart',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'wt-returns',
        code: 'RETURNS',
        name: 'Return Requests',
        description: 'Customer return authorization requests',
        active: true,
        defaultHandleTime: 240,
        color: '#f57c00',
        icon: 'refresh',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'wt-claims',
        code: 'CLAIMS',
        name: 'Insurance Claims',
        description: 'Damage and loss claims requiring investigation',
        active: true,
        defaultHandleTime: 300,
        color: '#7b1fa2',
        icon: 'file-text',
        createdAt: now,
        updatedAt: now,
      },
    ];

    defaultWorkTypes.forEach(wt => this.workTypes.set(wt.id, wt));

    // Default Queues
    const defaultQueues: Queue[] = [
      {
        id: 'q-default',
        name: 'Default Queue',
        description: 'Default queue for unassigned work',
        active: true,
        defaultPriority: 5,
        slaTarget: 3600,
        requiredSkills: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'q-priority',
        name: 'Priority Queue',
        description: 'High priority items requiring immediate attention',
        active: true,
        defaultPriority: 1,
        slaTarget: 1800,
        requiredSkills: ['priority-handling'],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
    ];

    defaultQueues.forEach(q => this.queues.set(q.id, q));

    // Default Dispositions based on user's examples
    const defaultDispositions: Disposition[] = [
      {
        id: 'disp-request-release',
        code: 'REQ_RELEASE',
        name: 'Request Release',
        description: 'Request release of order or hold',
        category: 'COMPLETED',
        requiresNote: false,
        active: true,
        order: 1,
        icon: 'unlock',
        color: 'green',
        queueIds: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disp-cancel',
        code: 'CANCEL',
        name: 'Cancel',
        description: 'Cancel the order or request',
        category: 'CANCELLED',
        requiresNote: true,
        active: true,
        order: 2,
        icon: 'x-circle',
        color: 'red',
        queueIds: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disp-delay',
        code: 'DELAY',
        name: 'Delay',
        description: 'Delay processing for later handling',
        category: 'DEFERRED',
        requiresNote: true,
        active: true,
        order: 3,
        icon: 'clock',
        color: 'orange',
        queueIds: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disp-request-info',
        code: 'REQ_INFO',
        name: 'Request Information',
        description: 'Additional information needed to proceed',
        category: 'DEFERRED',
        requiresNote: true,
        active: true,
        order: 4,
        icon: 'help-circle',
        color: 'orange',
        queueIds: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disp-move-qa',
        code: 'MOVE_QA',
        name: 'Move to QA',
        description: 'Move item to Quality Assurance queue',
        category: 'TRANSFERRED',
        requiresNote: false,
        active: true,
        order: 5,
        icon: 'check-square',
        color: 'blue',
        queueIds: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disp-change-status',
        code: 'CHANGE_STATUS',
        name: 'Change Status',
        description: 'Update the status of the item',
        category: 'COMPLETED',
        requiresNote: true,
        active: true,
        order: 6,
        icon: 'edit',
        color: 'green',
        queueIds: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disp-court-docs',
        code: 'REQ_COURT_DOCS',
        name: 'Request Court Documents',
        description: 'Request court documents for processing',
        category: 'DEFERRED',
        requiresNote: true,
        active: true,
        order: 7,
        icon: 'file',
        color: 'purple',
        queueIds: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disp-escalate',
        code: 'ESCALATE',
        name: 'Escalate to Supervisor',
        description: 'Escalate item to supervisor for review',
        category: 'ESCALATED',
        requiresNote: true,
        active: true,
        order: 8,
        icon: 'arrow-up',
        color: 'purple',
        queueIds: [],
        workTypeIds: [],
        createdAt: now,
        updatedAt: now,
      },
    ];

    defaultDispositions.forEach(d => this.dispositions.set(d.id, d));

    this.logger.log(
      `Initialized ${defaultDispositions.length} dispositions, ${defaultQueues.length} queues, ${defaultWorkTypes.length} work types`
    );
  }

  // ============ Disposition CRUD ============

  /**
   * Get all dispositions
   */
  getAllDispositions(): Disposition[] {
    return Array.from(this.dispositions.values()).sort((a, b) => a.order - b.order);
  }

  /**
   * Get active dispositions only
   */
  getActiveDispositions(): Disposition[] {
    return this.getAllDispositions().filter(d => d.active);
  }

  /**
   * Get dispositions for a specific queue and work type
   */
  getDispositionsForContext(queueId?: string, workTypeId?: string): Disposition[] {
    return this.getActiveDispositions().filter(d => {
      // If disposition has no queue restrictions, it applies to all
      const queueMatch = d.queueIds.length === 0 || (queueId && d.queueIds.includes(queueId));
      // If disposition has no work type restrictions, it applies to all
      const workTypeMatch = d.workTypeIds.length === 0 || (workTypeId && d.workTypeIds.includes(workTypeId));
      return queueMatch && workTypeMatch;
    });
  }

  /**
   * Get a disposition by ID
   */
  getDisposition(id: string): Disposition | null {
    return this.dispositions.get(id) || null;
  }

  /**
   * Get a disposition by code
   */
  getDispositionByCode(code: string): Disposition | null {
    return Array.from(this.dispositions.values()).find(d => d.code === code) || null;
  }

  /**
   * Create a new disposition
   */
  createDisposition(request: CreateDispositionRequest): Disposition {
    const now = new Date().toISOString();
    const id = `disp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Get max order for positioning
    const maxOrder = Math.max(...Array.from(this.dispositions.values()).map(d => d.order), 0);

    const disposition: Disposition = {
      id,
      code: request.code.toUpperCase().replace(/\s+/g, '_'),
      name: request.name,
      description: request.description,
      category: request.category,
      requiresNote: request.requiresNote ?? false,
      active: true,
      order: request.order ?? maxOrder + 1,
      icon: request.icon,
      color: request.color,
      queueIds: request.queueIds ?? [],
      workTypeIds: request.workTypeIds ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.dispositions.set(id, disposition);
    this.logger.log(`Created disposition: ${disposition.name} (${disposition.code})`);
    return disposition;
  }

  /**
   * Update an existing disposition
   */
  updateDisposition(id: string, request: UpdateDispositionRequest): Disposition | null {
    const existing = this.dispositions.get(id);
    if (!existing) {
      return null;
    }

    const updated: Disposition = {
      ...existing,
      ...request,
      code: request.code ? request.code.toUpperCase().replace(/\s+/g, '_') : existing.code,
      updatedAt: new Date().toISOString(),
    };

    this.dispositions.set(id, updated);
    this.logger.log(`Updated disposition: ${updated.name} (${updated.code})`);
    return updated;
  }

  /**
   * Soft delete a disposition (set active = false)
   */
  deleteDisposition(id: string): boolean {
    const existing = this.dispositions.get(id);
    if (!existing) {
      return false;
    }

    existing.active = false;
    existing.updatedAt = new Date().toISOString();
    this.dispositions.set(id, existing);
    this.logger.log(`Deactivated disposition: ${existing.name}`);
    return true;
  }

  /**
   * Reorder dispositions
   */
  reorderDispositions(orderedIds: string[]): Disposition[] {
    orderedIds.forEach((id, index) => {
      const disposition = this.dispositions.get(id);
      if (disposition) {
        disposition.order = index + 1;
        disposition.updatedAt = new Date().toISOString();
      }
    });
    return this.getAllDispositions();
  }

  // ============ Queue CRUD ============

  getAllQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  getActiveQueues(): Queue[] {
    return this.getAllQueues().filter(q => q.active);
  }

  getQueue(id: string): Queue | null {
    return this.queues.get(id) || null;
  }

  // ============ Work Type CRUD ============

  getAllWorkTypes(): WorkType[] {
    return Array.from(this.workTypes.values());
  }

  getActiveWorkTypes(): WorkType[] {
    return this.getAllWorkTypes().filter(wt => wt.active);
  }

  getWorkType(id: string): WorkType | null {
    return this.workTypes.get(id) || null;
  }

  getWorkTypeByCode(code: string): WorkType | null {
    return Array.from(this.workTypes.values()).find(wt => wt.code === code) || null;
  }

  // ============ Task Completion ============

  /**
   * Record a task completion with disposition
   */
  completeTask(
    request: CompleteTaskRequest,
    agentId: string,
    taskMetadata: {
      externalId?: string;
      workType: string;
      queue?: string;
      assignedAt: string;
    }
  ): TaskCompletion | null {
    const disposition = this.getDisposition(request.dispositionId);
    if (!disposition) {
      this.logger.error(`Disposition not found: ${request.dispositionId}`);
      return null;
    }

    if (disposition.requiresNote && !request.note) {
      this.logger.error(`Note required for disposition: ${disposition.code}`);
      return null;
    }

    const now = new Date().toISOString();
    const assignedTime = new Date(taskMetadata.assignedAt).getTime();
    const completedTime = new Date(now).getTime();
    const handleTime = Math.round((completedTime - assignedTime) / 1000);

    const completion: TaskCompletion = {
      id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId: request.taskId,
      externalId: taskMetadata.externalId,
      agentId,
      dispositionId: disposition.id,
      dispositionCode: disposition.code,
      dispositionCategory: disposition.category,
      note: request.note,
      workType: taskMetadata.workType,
      queue: taskMetadata.queue,
      handleTime,
      assignedAt: taskMetadata.assignedAt,
      completedAt: now,
    };

    this.completions.push(completion);
    this.logger.log(
      `Task ${request.taskId} completed by ${agentId} with disposition ${disposition.code} (${handleTime}s)`
    );

    return completion;
  }

  /**
   * Get completions for an agent
   */
  getAgentCompletions(agentId: string, limit = 50): TaskCompletion[] {
    return this.completions
      .filter(c => c.agentId === agentId)
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get all completions (for admin/reporting)
   */
  getAllCompletions(limit = 100): TaskCompletion[] {
    return this.completions
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get disposition usage statistics
   */
  getDispositionStats(): DispositionStats[] {
    const counts = new Map<string, number>();
    let total = 0;

    this.completions.forEach(c => {
      counts.set(c.dispositionId, (counts.get(c.dispositionId) || 0) + 1);
      total++;
    });

    return Array.from(counts.entries())
      .map(([dispositionId, count]) => {
        const disposition = this.getDisposition(dispositionId);
        return {
          dispositionId,
          code: disposition?.code || 'UNKNOWN',
          name: disposition?.name || 'Unknown',
          count,
          percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  // ============ Configuration ============

  /**
   * Get full disposition configuration for Designer UI
   */
  getDispositionConfig(): DispositionConfig {
    return {
      dispositions: this.getAllDispositions(),
      queues: this.getAllQueues(),
      workTypes: this.getAllWorkTypes(),
      categories: DISPOSITION_CATEGORIES,
    };
  }
}
