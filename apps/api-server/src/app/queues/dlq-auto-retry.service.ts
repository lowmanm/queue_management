import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueuesService } from './queues.service';
import { QueueManagerService } from '../services/queue-manager.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { EventStoreService } from '../services/event-store.service';
import { Task } from '@nexus-queue/shared-models';

/**
 * DlqAutoRetryService — automatically re-ingests DLQ tasks on a configurable schedule.
 *
 * Runs every minute and checks all queues with `dlqAutoRetry.enabled === true`.
 * For each eligible DLQ entry (retryCount < maxRetries and backoff delay elapsed),
 * re-ingests the task through the pipeline orchestrator.
 *
 * Backoff formula: delay = intervalMinutes × backoffMultiplier^retryCount (minutes)
 */
@Injectable()
export class DlqAutoRetryService {
  private readonly logger = new Logger(DlqAutoRetryService.name);

  constructor(
    private readonly queuesService: QueuesService,
    private readonly queueManager: QueueManagerService,
    private readonly orchestrator: PipelineOrchestratorService,
    private readonly eventStore: EventStoreService,
  ) {}

  /**
   * Scheduled auto-retry job — runs every minute.
   * Checks all queues with auto-retry enabled and re-ingests eligible DLQ tasks.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async runAutoRetry(): Promise<void> {
    const queues = this.queuesService
      .getAllQueues()
      .filter((q) => q.dlqAutoRetry?.enabled === true);

    if (queues.length === 0) return;

    this.logger.debug(`Auto-retry check: ${queues.length} queue(s) with auto-retry enabled`);

    for (const queue of queues) {
      const config = queue.dlqAutoRetry!;
      await this.processQueueDlq(queue.id, config);
    }
  }

  private async processQueueDlq(
    queueId: string,
    config: { intervalMinutes: number; maxRetries: number; backoffMultiplier: number },
  ): Promise<void> {
    let dlqEntries;
    try {
      dlqEntries = await this.queueManager.getDLQTasks(queueId);
    } catch (err) {
      this.logger.error(`Failed to fetch DLQ tasks for queue ${queueId}: ${err}`);
      return;
    }

    const eligible = dlqEntries.filter(
      (entry) => entry.queuedTask.retryCount < config.maxRetries,
    );

    for (const entry of eligible) {
      const retryCount = entry.queuedTask.retryCount;
      const backoffMinutes =
        config.intervalMinutes * Math.pow(config.backoffMultiplier, retryCount);
      const backoffMs = backoffMinutes * 60 * 1000;
      const movedAt = new Date(entry.movedAt).getTime();
      const timeSinceLastAttemptMs = Date.now() - movedAt;

      if (timeSinceLastAttemptMs < backoffMs) {
        this.logger.debug(
          `DLQ task ${entry.queuedTask.id} not yet eligible — ` +
            `backoff ${Math.round(backoffMinutes)}m, elapsed ${Math.round(timeSinceLastAttemptMs / 60000)}m`,
        );
        continue;
      }

      const pipelineId = entry.queuedTask.pipelineId;
      await this.retryDlqTask(entry.queuedTask.id, pipelineId, entry.queuedTask.task);
    }
  }

  private async retryDlqTask(
    taskId: string,
    pipelineId: string,
    taskPayload: Task,
  ): Promise<void> {
    try {
      // Remove from DLQ before re-ingestion
      await this.queueManager.removeFromDLQ(taskId);

      // Re-ingest through orchestrator
      const result = await this.orchestrator.ingestTask({
        pipelineId,
        taskData: {
          externalId: taskPayload.externalId ?? taskId,
          workType: taskPayload.workType ?? 'GENERAL',
          title: taskPayload.title ?? 'DLQ Auto-Retry',
          priority: taskPayload.priority ?? 5,
          payloadUrl: taskPayload.payloadUrl ?? '',
          metadata: taskPayload.metadata as Record<string, string> | undefined,
        },
        source: 'api',
        sourceId: `dlq-auto-retry:${taskId}`,
      });

      this.logger.log(
        `DLQ auto-retry for task ${taskId}: ${result.status}`,
      );

      // Emit domain event
      void this.eventStore.emit({
        eventType: 'task.retried',
        aggregateId: result.taskId ?? taskId,
        aggregateType: 'task',
        payload: {
          originalTaskId: taskId,
          dlqAutoRetry: true,
          orchestrationStatus: result.status,
        },
        pipelineId,
      });
    } catch (err) {
      this.logger.error(`DLQ auto-retry failed for task ${taskId}: ${err}`);
    }
  }
}
