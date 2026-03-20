import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { QueueManagerService, DLQEntry } from '../services/queue-manager.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { EventStoreService } from '../services/event-store.service';

/**
 * Query parameters for filtering DLQ entries.
 */
interface DlqQueryParams {
  pipelineId?: string;
  queueId?: string;
  reason?: string;
  fromDate?: string;
  toDate?: string;
  limit?: string;
  offset?: string;
}

/**
 * Request body for rerouting a DLQ task to a different queue.
 */
interface RerouteBody {
  targetQueueId: string;
}

/**
 * DLQ Controller — exposes Dead Letter Queue inspection and recovery operations.
 *
 * Routes are registered before the QueueController's /queues/:id routes
 * (QueuesModule imports before PipelineModule) ensuring /queues/dlq/* is matched first.
 *
 * All endpoints: /api/queues/dlq/*
 */
@Controller('queues/dlq')
export class DlqController {
  constructor(
    private readonly queueManager: QueueManagerService,
    private readonly orchestrator: PipelineOrchestratorService,
    private readonly eventStore: EventStoreService,
  ) {}

  /**
   * GET /api/queues/dlq
   * List DLQ entries with optional filtering.
   */
  @Get()
  async getDlqTasks(@Query() query: DlqQueryParams): Promise<DLQEntry[]> {
    let entries = await this.queueManager.getDLQTasks(query.queueId);

    if (query.pipelineId) {
      entries = entries.filter(
        (e) => e.queuedTask.pipelineId === query.pipelineId,
      );
    }

    if (query.reason) {
      const reasonFilter = query.reason.toLowerCase();
      entries = entries.filter((e) =>
        e.reason.toLowerCase().includes(reasonFilter),
      );
    }

    if (query.fromDate) {
      const from = new Date(query.fromDate).getTime();
      entries = entries.filter((e) => new Date(e.movedAt).getTime() >= from);
    }

    if (query.toDate) {
      const to = new Date(query.toDate).getTime();
      entries = entries.filter((e) => new Date(e.movedAt).getTime() <= to);
    }

    const offset = parseInt(query.offset ?? '0', 10);
    const limit = parseInt(query.limit ?? '50', 10);

    return entries.slice(offset, offset + limit);
  }

  /**
   * GET /api/queues/dlq/stats
   * Aggregate DLQ statistics broken down by reason, queue, and pipeline.
   */
  @Get('stats')
  async getDlqStats(): Promise<{
    total: number;
    byReason: Record<string, number>;
    byQueue: Record<string, number>;
    byPipeline: Record<string, number>;
  }> {
    return this.queueManager.getDlqStats();
  }

  /**
   * POST /api/queues/dlq/:taskId/retry
   * Re-ingest the task through the full pipeline from scratch.
   */
  @Post(':taskId/retry')
  async retryTask(
    @Param('taskId') taskId: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.orchestrator.retryFromDLQ(taskId);
    if (!result.success) {
      throw new NotFoundException(result.error ?? `Task not found in DLQ: ${taskId}`);
    }
    void this.eventStore.emit({
      eventType: 'task.retried',
      aggregateId: taskId,
      aggregateType: 'task',
      payload: { newTaskId: result.taskId, trigger: 'dlq_retry' },
    });
    return { success: true, message: `Task ${taskId} re-ingested successfully` };
  }

  /**
   * POST /api/queues/dlq/:taskId/reroute
   * Move the task from DLQ directly to a specific queue (skipping routing rules).
   * Body: { targetQueueId: string }
   */
  @Post(':taskId/reroute')
  async rerouteTask(
    @Param('taskId') taskId: string,
    @Body() body: RerouteBody,
  ): Promise<{ success: boolean; message: string }> {
    if (!body?.targetQueueId) {
      throw new BadRequestException('targetQueueId is required');
    }

    const entry = await this.queueManager.removeFromDLQ(taskId);
    if (!entry) {
      throw new NotFoundException(`Task not found in DLQ: ${taskId}`);
    }

    const updatedTask = {
      ...entry.queuedTask,
      queueId: body.targetQueueId,
      retryCount: 0,
      lastFailureReason: undefined,
    };

    await this.queueManager.enqueue(body.targetQueueId, updatedTask);

    return {
      success: true,
      message: `Task ${taskId} rerouted to queue ${body.targetQueueId}`,
    };
  }

  /**
   * DELETE /api/queues/dlq/:taskId
   * Permanently discard the task from the DLQ.
   */
  @Delete(':taskId')
  async discardTask(
    @Param('taskId') taskId: string,
  ): Promise<{ success: boolean; message: string }> {
    const entry = await this.queueManager.removeFromDLQ(taskId);
    if (!entry) {
      throw new NotFoundException(`Task not found in DLQ: ${taskId}`);
    }
    return { success: true, message: `Task ${taskId} discarded from DLQ` };
  }
}
