import { Injectable, Logger } from '@nestjs/common';
import { Task } from '@nexus-queue/shared-models';
import { ExecutionService } from '../ingestion/execution.service';

/**
 * REST endpoint handler for Pull Mode task retrieval.
 *
 * Tasks are sourced from the execution pipeline (CSV → Route → Task).
 * Returns null when no tasks are available in the queue.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly executionService: ExecutionService) {}

  /**
   * Returns the next available task from the execution queue.
   * Returns null when no tasks are available.
   */
  getNextTask(agentId?: string): Task | null {
    const task = this.executionService.getNextPendingTask(
      agentId || 'pull-mode-agent'
    );

    if (task) {
      this.logger.log(
        `Pull Mode: Assigned task ${task.id} (${task.workType}) to ${agentId || 'anonymous'}`
      );
    } else {
      this.logger.debug(
        `Pull Mode: No tasks available for ${agentId || 'anonymous'}`
      );
    }

    return task;
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

    this.logger.log(
      `Task ${taskId} status updated to ${status} by agent ${agentId}`
    );
    return updates;
  }
}
