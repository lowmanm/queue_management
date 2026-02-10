import { Injectable, Logger } from '@nestjs/common';
import { Task, TaskStatus } from '@nexus-queue/shared-models';

/**
 * Unified task lifecycle store.
 * Single source of truth for all task state across the system.
 * Replaces the fragmented storage in TasksService and TaskSourceService.
 */
@Injectable()
export class TaskStoreService {
  private readonly logger = new Logger(TaskStoreService.name);

  /** All tasks by ID */
  private tasks = new Map<string, Task>();

  /** Index: external ID → task ID (for deduplication) */
  private externalIdIndex = new Map<string, string>();

  /** Counter for generating unique task IDs */
  private taskCounter = 1000;

  /** Generate a unique task ID */
  generateTaskId(): string {
    return `TASK-${++this.taskCounter}`;
  }

  /** Store a new task */
  create(task: Task): Task {
    this.tasks.set(task.id, task);

    if (task.externalId) {
      this.externalIdIndex.set(task.externalId, task.id);
    }

    this.logger.debug(`Task created: ${task.id} (status: ${task.status})`);
    return task;
  }

  /** Get a task by ID */
  getById(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /** Get a task by external ID */
  getByExternalId(externalId: string): Task | undefined {
    const taskId = this.externalIdIndex.get(externalId);
    return taskId ? this.tasks.get(taskId) : undefined;
  }

  /** Check if an external ID already exists */
  hasExternalId(externalId: string): boolean {
    return this.externalIdIndex.has(externalId);
  }

  /**
   * Transition a task to a new status with updated fields.
   * Returns the updated task or undefined if not found.
   */
  updateStatus(
    taskId: string,
    status: TaskStatus,
    updates?: Partial<Task>
  ): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task not found for status update: ${taskId}`);
      return undefined;
    }

    const oldStatus = task.status;
    const updated: Task = {
      ...task,
      ...updates,
      status,
    };

    this.tasks.set(taskId, updated);
    this.logger.debug(
      `Task ${taskId} status: ${oldStatus} → ${status}`
    );

    return updated;
  }

  /** Update arbitrary task fields without changing status */
  update(taskId: string, updates: Partial<Task>): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const updated: Task = { ...task, ...updates };
    this.tasks.set(taskId, updated);
    return updated;
  }

  /** Get all tasks with a given status */
  getByStatus(status: TaskStatus): Task[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === status
    );
  }

  /** Get all tasks assigned to an agent */
  getByAgent(agentId: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.assignedAgentId === agentId
    );
  }

  /** Get counts by status for monitoring */
  getStatusCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const task of this.tasks.values()) {
      counts[task.status] = (counts[task.status] || 0) + 1;
    }
    return counts;
  }

  /** Total tasks in store */
  get size(): number {
    return this.tasks.size;
  }
}
