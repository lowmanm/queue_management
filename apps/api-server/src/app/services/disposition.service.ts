import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Disposition,
  DispositionCategory,
  DispositionColor,
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
import { DispositionEntity } from '../entities/disposition.entity';
import { TaskCompletionEntity } from '../entities/task-completion.entity';

@Injectable()
export class DispositionService implements OnModuleInit {
  private readonly logger = new Logger(DispositionService.name);

  /** In-memory caches; loaded from DB on init */
  private dispositions: Map<string, Disposition> = new Map();
  private completions: TaskCompletion[] = [];

  // Static reference data — not persisted (no entity)
  private queues: Map<string, Queue> = new Map();
  private workTypes: Map<string, WorkType> = new Map();

  constructor(
    @InjectRepository(DispositionEntity)
    private readonly dispositionRepo: Repository<DispositionEntity>,
    @InjectRepository(TaskCompletionEntity)
    private readonly completionRepo: Repository<TaskCompletionEntity>
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadDispositionsFromDb();
    await this.loadCompletionsFromDb();
    this.initializeStaticDefaults();
  }

  private async loadDispositionsFromDb(): Promise<void> {
    const entities = await this.dispositionRepo.find({ order: { order: 'ASC' } });
    if (entities.length > 0) {
      this.dispositions.clear();
      for (const entity of entities) {
        this.dispositions.set(entity.id, this.toDispositionModel(entity));
      }
      this.logger.log(`Loaded ${entities.length} dispositions from DB`);
    } else {
      // Seed defaults on first run
      await this.seedDefaultDispositions();
    }
  }

  private async loadCompletionsFromDb(): Promise<void> {
    const entities = await this.completionRepo.find({
      order: { completedAt: 'DESC' },
    });
    this.completions = entities.map((e) => this.toCompletionModel(e));
    this.logger.log(`Loaded ${this.completions.length} task completions from DB`);
  }

  private initializeStaticDefaults(): void {
    const now = new Date().toISOString();

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

    defaultWorkTypes.forEach((wt) => this.workTypes.set(wt.id, wt));

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

    defaultQueues.forEach((q) => this.queues.set(q.id, q));
  }

  private async seedDefaultDispositions(): Promise<void> {
    const now = new Date().toISOString();
    const defaultDispositions: Omit<Disposition, 'createdAt' | 'updatedAt'>[] = [
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
      },
    ];

    for (const d of defaultDispositions) {
      const full: Disposition = { ...d, createdAt: now, updatedAt: now };
      const saved = await this.dispositionRepo.save(this.toDispositionEntity(full));
      this.dispositions.set(saved.id, this.toDispositionModel(saved));
    }

    this.logger.log(`Seeded ${defaultDispositions.length} default dispositions`);
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
    return this.getAllDispositions().filter((d) => d.active);
  }

  /**
   * Get dispositions for a specific queue and work type
   */
  getDispositionsForContext(queueId?: string, workTypeId?: string): Disposition[] {
    return this.getActiveDispositions().filter((d) => {
      const queueMatch = d.queueIds.length === 0 || (queueId && d.queueIds.includes(queueId));
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
    return Array.from(this.dispositions.values()).find((d) => d.code === code) || null;
  }

  /**
   * Create a new disposition
   */
  async createDisposition(request: CreateDispositionRequest): Promise<Disposition> {
    const now = new Date().toISOString();
    const id = `disp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const maxOrder = Math.max(...Array.from(this.dispositions.values()).map((d) => d.order), 0);

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

    const saved = await this.dispositionRepo.save(this.toDispositionEntity(disposition));
    const model = this.toDispositionModel(saved);
    this.dispositions.set(model.id, model);
    this.logger.log(`Created disposition: ${model.name} (${model.code})`);
    return model;
  }

  /**
   * Update an existing disposition
   */
  async updateDisposition(id: string, request: UpdateDispositionRequest): Promise<Disposition | null> {
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

    const saved = await this.dispositionRepo.save(this.toDispositionEntity(updated));
    const model = this.toDispositionModel(saved);
    this.dispositions.set(id, model);
    this.logger.log(`Updated disposition: ${model.name} (${model.code})`);
    return model;
  }

  /**
   * Soft delete a disposition (set active = false)
   */
  async deleteDisposition(id: string): Promise<boolean> {
    const existing = this.dispositions.get(id);
    if (!existing) {
      return false;
    }

    const updated: Disposition = {
      ...existing,
      active: false,
      updatedAt: new Date().toISOString(),
    };

    await this.dispositionRepo.save(this.toDispositionEntity(updated));
    this.dispositions.set(id, updated);
    this.logger.log(`Deactivated disposition: ${existing.name}`);
    return true;
  }

  /**
   * Reorder dispositions
   */
  async reorderDispositions(orderedIds: string[]): Promise<Disposition[]> {
    const toSave: DispositionEntity[] = [];

    for (const [index, id] of orderedIds.entries()) {
      const disposition = this.dispositions.get(id);
      if (disposition) {
        const updated: Disposition = {
          ...disposition,
          order: index + 1,
          updatedAt: new Date().toISOString(),
        };
        this.dispositions.set(id, updated);
        toSave.push(this.toDispositionEntity(updated));
      }
    }

    if (toSave.length > 0) {
      await this.dispositionRepo.save(toSave);
    }

    return this.getAllDispositions();
  }

  // ============ Queue CRUD ============

  getAllQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  getActiveQueues(): Queue[] {
    return this.getAllQueues().filter((q) => q.active);
  }

  getQueue(id: string): Queue | null {
    return this.queues.get(id) || null;
  }

  // ============ Work Type CRUD ============

  getAllWorkTypes(): WorkType[] {
    return Array.from(this.workTypes.values());
  }

  getActiveWorkTypes(): WorkType[] {
    return this.getAllWorkTypes().filter((wt) => wt.active);
  }

  getWorkType(id: string): WorkType | null {
    return this.workTypes.get(id) || null;
  }

  getWorkTypeByCode(code: string): WorkType | null {
    return Array.from(this.workTypes.values()).find((wt) => wt.code === code) || null;
  }

  // ============ Task Completion ============

  /**
   * Record a task completion with disposition
   */
  async completeTask(
    request: CompleteTaskRequest,
    agentId: string,
    taskMetadata: {
      externalId?: string;
      workType: string;
      queue?: string;
      assignedAt: string;
    }
  ): Promise<TaskCompletion | null> {
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

    await this.completionRepo.save(this.toCompletionEntity(completion));
    this.completions.unshift(completion);

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
      .filter((c) => c.agentId === agentId)
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

    this.completions.forEach((c) => {
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

  // ============ Entity mapping ============

  private toDispositionEntity(d: Disposition): DispositionEntity {
    const entity = new DispositionEntity();
    entity.id = d.id;
    entity.code = d.code;
    entity.name = d.name;
    entity.description = d.description;
    entity.category = d.category;
    entity.requiresNote = d.requiresNote;
    entity.active = d.active;
    entity.order = d.order;
    entity.icon = d.icon;
    entity.color = d.color;
    entity.queueIds = d.queueIds;
    entity.workTypeIds = d.workTypeIds;
    return entity;
  }

  private toDispositionModel(entity: DispositionEntity): Disposition {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name,
      description: entity.description,
      category: entity.category as DispositionCategory,
      requiresNote: entity.requiresNote,
      active: entity.active,
      order: entity.order,
      icon: entity.icon,
      color: entity.color as DispositionColor | undefined,
      queueIds: entity.queueIds ?? [],
      workTypeIds: entity.workTypeIds ?? [],
      createdAt: entity.createdAt?.toISOString(),
      updatedAt: entity.updatedAt?.toISOString(),
    };
  }

  private toCompletionEntity(c: TaskCompletion): TaskCompletionEntity {
    const entity = new TaskCompletionEntity();
    entity.id = c.id;
    entity.taskId = c.taskId;
    entity.externalId = c.externalId;
    entity.agentId = c.agentId;
    entity.dispositionId = c.dispositionId;
    entity.dispositionCode = c.dispositionCode;
    entity.dispositionCategory = c.dispositionCategory;
    entity.note = c.note;
    entity.workType = c.workType;
    entity.queue = c.queue;
    entity.handleTime = c.handleTime;
    entity.assignedAt = new Date(c.assignedAt);
    return entity;
  }

  private toCompletionModel(entity: TaskCompletionEntity): TaskCompletion {
    return {
      id: entity.id,
      taskId: entity.taskId,
      externalId: entity.externalId,
      agentId: entity.agentId,
      dispositionId: entity.dispositionId,
      dispositionCode: entity.dispositionCode,
      dispositionCategory: entity.dispositionCategory as DispositionCategory,
      note: entity.note,
      workType: entity.workType ?? '',
      queue: entity.queue,
      handleTime: entity.handleTime,
      assignedAt: entity.assignedAt?.toISOString() ?? new Date().toISOString(),
      completedAt: entity.completedAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
