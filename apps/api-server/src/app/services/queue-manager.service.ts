import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, IsNull, Repository } from 'typeorm';
import { Task } from '@nexus-queue/shared-models';
import { QueuedTaskEntity } from '../entities/queued-task.entity';
import { DLQEntryEntity } from '../entities/dlq-entry.entity';

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
 * Backed by TypeORM repositories for persistence.
 */
@Injectable()
export class QueueManagerService {
  private readonly logger = new Logger(QueueManagerService.name);

  /** Completed/dequeued task history for wait-time metrics (in-memory) */
  private completedWaitTimes = new Map<string, number[]>();

  constructor(
    @InjectRepository(QueuedTaskEntity)
    private readonly queuedTaskRepo: Repository<QueuedTaskEntity>,
    @InjectRepository(DLQEntryEntity)
    private readonly dlqRepo: Repository<DLQEntryEntity>
  ) {}

  /**
   * Ensure a queue exists (no-op: DB tables handle implicit queue creation).
   */
  ensureQueue(_queueId: string): void {
    // No-op for DB-backed implementation
  }

  /**
   * Add a task to a named queue.
   * Returns the queued task entry.
   */
  async enqueue(queueId: string, queuedTask: QueuedTask): Promise<QueuedTask> {
    const entity = new QueuedTaskEntity();
    entity.taskId = queuedTask.id;
    entity.pipelineId = queuedTask.pipelineId;
    entity.queueId = queueId;
    entity.taskPayload = queuedTask.task as unknown as Record<string, unknown>;
    entity.priority = queuedTask.priority;
    entity.retryCount = queuedTask.retryCount;
    entity.maxRetries = queuedTask.maxRetries;
    entity.lastFailureReason = queuedTask.lastFailureReason;
    entity.slaDeadline = queuedTask.slaDeadline
      ? new Date(queuedTask.slaDeadline)
      : undefined;

    const saved = await this.queuedTaskRepo.save(entity);

    this.logger.debug(
      `Enqueued task ${queuedTask.id} in queue ${queueId} (priority: ${queuedTask.priority})`
    );

    return this.toModel(saved);
  }

  /**
   * Remove and return the highest-priority task from a queue.
   * Returns null if queue is empty.
   */
  async dequeue(queueId: string): Promise<QueuedTask | null> {
    const entity = await this.queuedTaskRepo.findOne({
      where: { queueId },
      order: { priority: 'ASC', enqueuedAt: 'ASC' },
    });

    if (!entity) return null;

    await this.queuedTaskRepo.delete(entity.id);

    const waitMs = Date.now() - entity.enqueuedAt.getTime();
    this.recordWaitTime(queueId, waitMs);

    this.logger.debug(
      `Dequeued task ${entity.taskId} from queue ${queueId} ` +
        `(waited ${Math.round(waitMs / 1000)}s)`
    );

    return this.toModel(entity);
  }

  /**
   * Peek at the next task without removing it.
   */
  async peek(queueId: string): Promise<QueuedTask | null> {
    const entity = await this.queuedTaskRepo.findOne({
      where: { queueId },
      order: { priority: 'ASC', enqueuedAt: 'ASC' },
    });
    return entity ? this.toModel(entity) : null;
  }

  /**
   * Return a task to the queue after agent failure/timeout.
   * Increments retryCount. Moves to DLQ if maxRetries exceeded.
   */
  async requeue(queuedTask: QueuedTask, reason: string): Promise<void> {
    const newRetryCount = queuedTask.retryCount + 1;

    if (newRetryCount >= queuedTask.maxRetries) {
      await this.moveToDLQ(
        { ...queuedTask, retryCount: newRetryCount, lastFailureReason: reason },
        `max_retries_exceeded: ${reason}`
      );
      return;
    }

    const existing = await this.queuedTaskRepo.findOneBy({
      taskId: queuedTask.id,
    });

    if (existing) {
      existing.retryCount = newRetryCount;
      existing.lastFailureReason = reason;
      await this.queuedTaskRepo.save(existing);
    } else {
      await this.enqueue(queuedTask.queueId, {
        ...queuedTask,
        retryCount: newRetryCount,
        lastFailureReason: reason,
      });
    }

    this.logger.log(
      `Requeued task ${queuedTask.id} (retry ${newRetryCount}/${queuedTask.maxRetries}, reason: ${reason})`
    );
  }

  /**
   * Move a task to the Dead Letter Queue.
   */
  async moveToDLQ(queuedTask: QueuedTask, reason: string): Promise<void> {
    await this.removeFromQueue(queuedTask.queueId, queuedTask.id);

    const entry = new DLQEntryEntity();
    entry.taskId = queuedTask.id;
    entry.queueId = queuedTask.queueId;
    entry.pipelineId = queuedTask.pipelineId;
    entry.failureReason = reason.substring(0, 100);
    entry.taskPayload = queuedTask.task as unknown as Record<string, unknown>;
    entry.queuedTaskPayload =
      queuedTask as unknown as Record<string, unknown>;
    entry.retryCount = queuedTask.retryCount;

    await this.dlqRepo.save(entry);

    this.logger.warn(`Task ${queuedTask.id} moved to DLQ: ${reason}`);
  }

  /**
   * Boost a task's priority (lower number = higher urgency).
   */
  async reprioritize(
    queueId: string,
    taskId: string,
    newPriority: number,
    reason: string
  ): Promise<boolean> {
    const entity = await this.queuedTaskRepo.findOneBy({ queueId, taskId });
    if (!entity) return false;

    const oldPriority = entity.priority;
    entity.priority = Math.max(1, Math.min(10, newPriority));
    await this.queuedTaskRepo.save(entity);

    this.logger.log(
      `Reprioritized task ${taskId}: ${oldPriority} → ${entity.priority} (${reason})`
    );
    return true;
  }

  /**
   * Remove a specific task from a queue (e.g., when assigned to agent).
   */
  async removeFromQueue(
    queueId: string,
    taskId: string
  ): Promise<QueuedTask | null> {
    const entity = await this.queuedTaskRepo.findOneBy({ queueId, taskId });
    if (!entity) return null;

    await this.queuedTaskRepo.delete(entity.id);
    return this.toModel(entity);
  }

  // === DLQ Operations ===

  /** Get all DLQ entries, optionally filtered by queue */
  async getDLQTasks(queueId?: string): Promise<DLQEntry[]> {
    const entities = queueId
      ? await this.dlqRepo.findBy({ queueId })
      : await this.dlqRepo.find();
    return entities.map((e) => this.toDLQModel(e));
  }

  /** Remove a task from DLQ (for retry or discard) */
  async removeFromDLQ(taskId: string): Promise<DLQEntry | null> {
    const entity = await this.dlqRepo.findOneBy({ taskId });
    if (!entity) return null;

    await this.dlqRepo.delete(entity.id);
    return this.toDLQModel(entity);
  }

  /**
   * Get aggregate DLQ statistics broken down by reason, queue, and pipeline.
   */
  async getDlqStats(): Promise<{
    total: number;
    byReason: Record<string, number>;
    byQueue: Record<string, number>;
    byPipeline: Record<string, number>;
  }> {
    const entries = await this.dlqRepo.find();

    const byReason: Record<string, number> = {};
    const byQueue: Record<string, number> = {};
    const byPipeline: Record<string, number> = {};

    for (const entry of entries) {
      const reasonKey = entry.failureReason.split(':')[0].trim();
      byReason[reasonKey] = (byReason[reasonKey] ?? 0) + 1;
      byQueue[entry.queueId] = (byQueue[entry.queueId] ?? 0) + 1;
      if (entry.pipelineId) {
        byPipeline[entry.pipelineId] =
          (byPipeline[entry.pipelineId] ?? 0) + 1;
      }
    }

    return { total: entries.length, byReason, byQueue, byPipeline };
  }

  // === Observability ===

  /** Get the depth (number of tasks) in a queue */
  async getQueueDepth(queueId: string): Promise<number> {
    return this.queuedTaskRepo.count({ where: { queueId } });
  }

  /** Get all tasks in a queue (read-only snapshot) */
  async getQueueTasks(queueId: string): Promise<QueuedTask[]> {
    const entities = await this.queuedTaskRepo.find({
      where: { queueId },
      order: { priority: 'ASC', enqueuedAt: 'ASC' },
    });
    return entities.map((e) => this.toModel(e));
  }

  /** Get all known queue IDs */
  async getQueueIds(): Promise<string[]> {
    const rows = await this.queuedTaskRepo
      .createQueryBuilder('qt')
      .select('qt.queueId', 'queueId')
      .distinct(true)
      .getRawMany<{ queueId: string }>();
    return rows.map((r) => r['queueId']);
  }

  /** Get health stats for a queue */
  async getQueueStats(queueId: string): Promise<QueueHealthStats> {
    const depth = await this.queuedTaskRepo.count({ where: { queueId } });
    const dlqCount = await this.dlqRepo.count({ where: { queueId } });

    let oldestAge = 0;
    if (depth > 0) {
      const oldest = await this.queuedTaskRepo.findOne({
        where: { queueId },
        order: { enqueuedAt: 'ASC' },
      });
      if (oldest) {
        oldestAge = Math.round(
          (Date.now() - oldest.enqueuedAt.getTime()) / 1000
        );
      }
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
      depth,
      oldestTaskAge: oldestAge,
      avgWaitTime: avgWait,
      dlqCount,
    };
  }

  /** Get all queued tasks across all queues that are approaching SLA */
  async getTasksApproachingSLA(thresholdPercent: number): Promise<QueuedTask[]> {
    const entities = await this.queuedTaskRepo.find({
      where: { slaDeadline: Not(IsNull()) },
    });

    const now = Date.now();
    return entities
      .map((e) => this.toModel(e))
      .filter((task) => {
        if (!task.slaDeadline) return false;
        const deadline = new Date(task.slaDeadline).getTime();
        const enqueued = new Date(task.enqueuedAt).getTime();
        const totalWindow = deadline - enqueued;
        const elapsed = now - enqueued;
        return totalWindow > 0 && elapsed / totalWindow >= thresholdPercent / 100;
      });
  }

  // === Private Helpers ===

  private toModel(entity: QueuedTaskEntity): QueuedTask {
    return {
      id: entity.taskId,
      pipelineId: entity.pipelineId,
      queueId: entity.queueId,
      task: entity.taskPayload as unknown as Task,
      priority: entity.priority,
      enqueuedAt: entity.enqueuedAt.toISOString(),
      slaDeadline: entity.slaDeadline?.toISOString(),
      retryCount: entity.retryCount,
      maxRetries: entity.maxRetries,
      lastFailureReason: entity.lastFailureReason,
    };
  }

  private toDLQModel(entity: DLQEntryEntity): DLQEntry {
    return {
      queuedTask: entity.queuedTaskPayload as unknown as QueuedTask,
      reason: entity.failureReason,
      movedAt: entity.failedAt.toISOString(),
    };
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
