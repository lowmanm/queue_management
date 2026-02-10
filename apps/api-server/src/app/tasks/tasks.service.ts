import { Injectable, Logger } from '@nestjs/common';
import { Task } from '@nexus-queue/shared-models';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  // Task counter for unique IDs
  private taskCounter = 1000;

  // Real task queues - populated by Volume Loaders
  private pendingTasks: Task[] = [];
  private activeTasks: Map<string, Task> = new Map();

  constructor() {
    this.logger.log('Tasks service initialized (no mock data)');
  }

  /**
   * Add a task to the pending queue
   * Called by Volume Loader when loading tasks from data sources
   */
  addTask(taskData: Partial<Task>): Task {
    const now = new Date().toISOString();

    const task: Task = {
      id: `TASK-${++this.taskCounter}`,
      externalId: taskData.externalId || `EXT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      workType: taskData.workType || 'GENERAL',
      title: taskData.title || 'Untitled Task',
      description: taskData.description,
      payloadUrl: taskData.payloadUrl,
      metadata: taskData.metadata,
      priority: taskData.priority || 5,
      skills: taskData.skills,
      queue: taskData.queue,
      status: 'PENDING',
      createdAt: now,
      availableAt: now,
      reservationTimeout: taskData.reservationTimeout || 30,
      actions: taskData.actions,
    };

    this.pendingTasks.push(task);
    this.logger.debug(`Added task ${task.id} to pending queue`);

    return task;
  }

  /**
   * Returns the next available task, or null if none available.
   * In a real implementation, this would query the database
   * and apply routing logic based on agent skills and task priority.
   */
  getNextTask(agentId?: string): Task | null {
    if (this.pendingTasks.length === 0) {
      return null;
    }

    // Sort by priority (lower number = higher priority)
    this.pendingTasks.sort((a, b) => (a.priority || 5) - (b.priority || 5));

    // Get next task
    const task = this.pendingTasks.shift();
    if (!task) {
      return null;
    }

    const now = new Date().toISOString();

    // Reserve the task
    task.status = 'RESERVED';
    task.reservedAt = now;
    task.assignedAgentId = agentId;
    task.assignmentHistory = agentId
      ? [{ agentId, assignedAt: now }]
      : undefined;

    // Move to active tasks
    this.activeTasks.set(task.id, task);

    return task;
  }

  /**
   * Get pending task count
   */
  getPendingCount(): number {
    return this.pendingTasks.length;
  }

  /**
   * Get task by ID
   */
  getTaskById(taskId: string): Task | undefined {
    return this.activeTasks.get(taskId) || this.pendingTasks.find(t => t.id === taskId);
  }

  /**
   * Updates a task's status and timestamps.
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
        updates.startedAt = now;
        break;
      case 'COMPLETED':
        updates.completedAt = now;
        // Remove from active tasks
        this.activeTasks.delete(taskId);
        break;
      case 'TRANSFERRED':
        // Task goes back to pending queue for reassignment
        const task = this.activeTasks.get(taskId);
        if (task) {
          task.status = 'PENDING';
          task.assignedAgentId = undefined;
          this.pendingTasks.push(task);
          this.activeTasks.delete(taskId);
        }
        break;
    }

    return updates;
  }

  /**
   * Get stats summary
   */
  getStats(): { pending: number; active: number } {
    return {
      pending: this.pendingTasks.length,
      active: this.activeTasks.size,
    };
  }
}
