import { Injectable, Logger } from '@nestjs/common';
import { Task } from '@nexus-queue/shared-models';

/**
 * Entry in the priority queue. Wraps a Task with queue metadata.
 */
export interface QueuedTask {
  /** Task ID */
  id: string;
  /** Source pipeline */
  pipelineId: string;
  /** Queue this task is sitting in */
  queueId: string;
  /** Full task payload */
  task: Task;
  /** Priority (1 = highest, 10 = lowest) */
  priority: number;
  /** When this task entered the queue */
  enqueuedAt: string;
  /** ISO timestamp when SLA will breach */
  slaDeadline?: string;
  /** How many times this task has been re-queued after failure */
  retryCount: number;
  /** Max retries before DLQ */
  maxRetries: number;
  /** Reason for last failure (if re-queued) */
  lastFailureReason?: string;
}

export interface QueueHealthStats {
  queueId: string;
  depth: number;
  oldestTaskAge: number;
  avgWaitTime: number;
  dlqCount: number;
}

export interface DLQEntry {
  queuedTask: QueuedTask;
  reason: string;
  movedAt: string;
}

/**
 * Priority Queue Manager with Dead Letter Queue support.
 *
 * Each named queue maintains tasks sorted by (priority ASC, enqueuedAt ASC).
 * Dequeue always returns the highest-urgency (lowest priority number), oldest task.
 */
@Injectable()
export class QueueManagerService {
  private readonly logger = new Logger(QueueManagerService.name);

  /** Named queues: queueId → sorted array of QueuedTasks */
  private queues = new Map<string, QueuedTask[]>();

  /** Dead Letter Queue: all failed tasks */
  private dlq: DLQEntry[] = [];

  /** Completed/dequeued task history for wait-time metrics */
  private completedWaitTimes = new Map<string, number[]>();

  /**
   * Ensure a queue exists (creates if needed).
   */
  ensureQueue(queueId: string): void {
    if (!this.queues.has(queueId)) {
      this.queues.set(queueId, []);
      this.completedWaitTimes.set(queueId, []);
      this.logger.log(`Queue created: ${queueId}`);
    }
  }

  /**
   * Add a task to a named queue, maintaining priority sort order.
   * Returns the queued task entry.
   */
  enqueue(queueId: string, queuedTask: QueuedTask): QueuedTask {
    this.ensureQueue(queueId);
    const queue = this.queues.get(queueId)!;

    // Insert in sorted position: priority ASC, enqueuedAt ASC
    const insertIdx = this.findInsertIndex(queue, queuedTask);
    queue.splice(insertIdx, 0, queuedTask);

    this.logger.debug(
      `Enqueued task ${queuedTask.id} in queue ${queueId} ` +
        `(priority: ${queuedTask.priority}, depth: ${queue.length})`
    );

    return queuedTask;
  }

  /**
   * Remove and return the highest-priority task from a queue.
   * Returns null if queue is empty.
   */
  dequeue(queueId: string): QueuedTask | null {
    const queue = this.queues.get(queueId);
    if (!queue || queue.length === 0) return null;

    const task = queue.shift()!;

    // Record wait time for metrics
    const waitMs =
      Date.now() - new Date(task.enqueuedAt).getTime();
    this.recordWaitTime(queueId, waitMs);

    this.logger.debug(
      `Dequeued task ${task.id} from queue ${queueId} ` +
        `(waited ${Math.round(waitMs / 1000)}s, remaining: ${queue.length})`
    );

    return task;
  }

  /**
   * Peek at the next task without removing it.
   */
  peek(queueId: string): QueuedTask | null {
    const queue = this.queues.get(queueId);
    return queue && queue.length > 0 ? queue[0] : null;
  }

  /**
   * Return a task to the queue after agent failure/timeout.
   * Increments retryCount. Moves to DLQ if maxRetries exceeded.
   */
  requeue(queuedTask: QueuedTask, reason: string): void {
    queuedTask.retryCount++;
    queuedTask.lastFailureReason = reason;

    if (queuedTask.retryCount >= queuedTask.maxRetries) {
      this.moveToDLQ(queuedTask, `max_retries_exceeded: ${reason}`);
      return;
    }

    // Re-enqueue (keeps same priority and original enqueuedAt for fairness)
    this.enqueue(queuedTask.queueId, queuedTask);

    this.logger.log(
      `Requeued task ${queuedTask.id} (retry ${queuedTask.retryCount}/${queuedTask.maxRetries}, reason: ${reason})`
    );
  }

  /**
   * Move a task to the Dead Letter Queue.
   */
  moveToDLQ(queuedTask: QueuedTask, reason: string): void {
    // Remove from active queue if still there
    this.removeFromQueue(queuedTask.queueId, queuedTask.id);

    this.dlq.push({
      queuedTask,
      reason,
      movedAt: new Date().toISOString(),
    });

    this.logger.warn(
      `Task ${queuedTask.id} moved to DLQ: ${reason}`
    );
  }

  /**
   * Boost a task's priority (lower number = higher urgency).
   * Removes and re-inserts to maintain sort order.
   */
  reprioritize(
    queueId: string,
    taskId: string,
    newPriority: number,
    reason: string
  ): boolean {
    const queue = this.queues.get(queueId);
    if (!queue) return false;

    const idx = queue.findIndex((t) => t.id === taskId);
    if (idx === -1) return false;

    const [task] = queue.splice(idx, 1);
    const oldPriority = task.priority;
    task.priority = Math.max(1, Math.min(10, newPriority));

    // Re-insert at correct sorted position
    const insertIdx = this.findInsertIndex(queue, task);
    queue.splice(insertIdx, 0, task);

    this.logger.log(
      `Reprioritized task ${taskId}: ${oldPriority} → ${task.priority} (${reason})`
    );
    return true;
  }

  /**
   * Remove a specific task from a queue (e.g., when assigned to agent).
   */
  removeFromQueue(queueId: string, taskId: string): QueuedTask | null {
    const queue = this.queues.get(queueId);
    if (!queue) return null;

    const idx = queue.findIndex((t) => t.id === taskId);
    if (idx === -1) return null;

    const [removed] = queue.splice(idx, 1);
    return removed;
  }

  // === DLQ Operations ===

  /** Get all DLQ entries, optionally filtered by queue */
  getDLQTasks(queueId?: string): DLQEntry[] {
    if (queueId) {
      return this.dlq.filter((e) => e.queuedTask.queueId === queueId);
    }
    return [...this.dlq];
  }

  /** Remove a task from DLQ (for retry or discard) */
  removeFromDLQ(taskId: string): DLQEntry | null {
    const idx = this.dlq.findIndex(
      (e) => e.queuedTask.id === taskId
    );
    if (idx === -1) return null;

    const [removed] = this.dlq.splice(idx, 1);
    return removed;
  }

  // === Observability ===

  /** Get the depth (number of tasks) in a queue */
  getQueueDepth(queueId: string): number {
    return this.queues.get(queueId)?.length ?? 0;
  }

  /** Get all tasks in a queue (read-only snapshot) */
  getQueueTasks(queueId: string): QueuedTask[] {
    return [...(this.queues.get(queueId) ?? [])];
  }

  /** Get all known queue IDs */
  getQueueIds(): string[] {
    return Array.from(this.queues.keys());
  }

  /** Get health stats for a queue */
  getQueueStats(queueId: string): QueueHealthStats {
    const queue = this.queues.get(queueId) ?? [];
    const now = Date.now();

    let oldestAge = 0;
    if (queue.length > 0) {
      oldestAge = Math.round(
        (now - new Date(queue[0].enqueuedAt).getTime()) / 1000
      );
    }

    const waitTimes = this.completedWaitTimes.get(queueId) ?? [];
    const avgWait =
      waitTimes.length > 0
        ? Math.round(
            waitTimes.reduce((sum, t) => sum + t, 0) /
              waitTimes.length /
              1000
          )
        : 0;

    return {
      queueId,
      depth: queue.length,
      oldestTaskAge: oldestAge,
      avgWaitTime: avgWait,
      dlqCount: this.dlq.filter(
        (e) => e.queuedTask.queueId === queueId
      ).length,
    };
  }

  /** Get all queued tasks across all queues that are approaching SLA */
  getTasksApproachingSLA(thresholdPercent: number): QueuedTask[] {
    const now = Date.now();
    const results: QueuedTask[] = [];

    for (const queue of this.queues.values()) {
      for (const task of queue) {
        if (!task.slaDeadline) continue;

        const deadline = new Date(task.slaDeadline).getTime();
        const enqueued = new Date(task.enqueuedAt).getTime();
        const totalWindow = deadline - enqueued;
        const elapsed = now - enqueued;

        if (totalWindow > 0 && elapsed / totalWindow >= thresholdPercent / 100) {
          results.push(task);
        }
      }
    }

    return results;
  }

  // === Private Helpers ===

  /** Binary search for sorted insertion index */
  private findInsertIndex(
    queue: QueuedTask[],
    task: QueuedTask
  ): number {
    let low = 0;
    let high = queue.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const cmp = this.compareTasks(queue[mid], task);
      if (cmp <= 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }

  /** Compare two tasks for priority ordering */
  private compareTasks(a: QueuedTask, b: QueuedTask): number {
    if (a.priority !== b.priority) {
      return a.priority - b.priority; // Lower number = higher priority
    }
    // Same priority: older task first (FIFO)
    return (
      new Date(a.enqueuedAt).getTime() -
      new Date(b.enqueuedAt).getTime()
    );
  }

  /** Record wait time for avg calculation (keep last 100 per queue) */
  private recordWaitTime(queueId: string, waitMs: number): void {
    const times = this.completedWaitTimes.get(queueId) ?? [];
    times.push(waitMs);
    if (times.length > 100) {
      times.shift();
    }
    this.completedWaitTimes.set(queueId, times);
  }
}
