import { Injectable, Logger } from '@nestjs/common';
import { Task } from '@nexus-queue/shared-models';
import { ExecutionService } from '../ingestion/execution.service';

/**
 * Distributes tasks from the execution pipeline to agents.
 *
 * Tasks are sourced exclusively from CSV uploads that have been
 * processed through the routing engine via ExecutionService.
 * When no tasks are available, returns null (agent stays IDLE).
 */
@Injectable()
export class TaskDistributorService {
  private readonly logger = new Logger(TaskDistributorService.name);

  constructor(private readonly executionService: ExecutionService) {}

  /**
   * Get the next task for a specific agent.
   * Pulls from the execution pipeline (CSV → Route → Task).
   * Returns null when the queue is empty.
   */
  getNextTaskForAgent(agentId: string): Task | null {
    const task = this.executionService.getNextPendingTask(agentId);

    if (task) {
      this.logger.log(
        `Assigned task ${task.id} (${task.workType}) to agent ${agentId} — ${this.executionService.getPendingTaskCount()} remaining in queue`
      );
      return task;
    }

    this.logger.debug(
      `No tasks available for agent ${agentId} — queue is empty`
    );
    return null;
  }

  /**
   * Get queue statistics for admin/monitoring.
   */
  getQueueStats(): {
    pendingTasks: number;
    workTypes: Record<string, number>;
  } {
    return {
      pendingTasks: this.executionService.getPendingTaskCount(),
      workTypes: {},
    };
  }
}
