import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  Task,
  TaskAction,
  TaskFromSource,
  TaskStatus,
} from '@nexus-queue/shared-models';
import { TaskStoreService } from './task-store.service';
import { QueueManagerService, QueuedTask } from './queue-manager.service';
import { RuleEngineService } from './rule-engine.service';
import { PipelineService } from '../pipelines/pipeline.service';
import { EventStoreService } from './event-store.service';

/**
 * Input accepted by the orchestrator from any data source.
 */
export interface TaskIngestionInput {
  /** Which pipeline to process through */
  pipelineId: string;
  /** Parsed task data from the source */
  taskData: TaskFromSource;
  /** Origin of this task (for tracking) */
  source: 'volume_loader' | 'csv_upload' | 'api' | 'manual';
  /** Optional: loader or upload ID for traceability */
  sourceId?: string;
}

/**
 * Result of the orchestration process.
 */
export interface OrchestrationResult {
  success: boolean;
  taskId?: string;
  queueId?: string;
  ruleId?: string;
  ruleName?: string;
  status: 'QUEUED' | 'DLQ' | 'REJECTED' | 'HELD' | 'DUPLICATE';
  error?: string;
  diagnostics?: unknown;
}

/**
 * Result of a distribution attempt.
 */
export interface DistributionResult {
  distributed: boolean;
  taskId?: string;
  agentId?: string;
  reason?: string;
}

/**
 * Pipeline Orchestrator — the single entry point for all tasks entering the system.
 *
 * Every record — whether from CSV upload, VolumeLoader, API, or manual entry —
 * goes through this service. The flow is:
 *
 *   1. VALIDATE  — Check required fields, deduplicate
 *   2. TRANSFORM — Apply Rule Engine modifications (priority, skills, metadata)
 *   3. ROUTE     — Determine target queue via Pipeline routing rules
 *   4. ENQUEUE   — Place into the correct priority queue
 *   5. SIGNAL    — Notify distribution engine that work is available
 */
@Injectable()
export class PipelineOrchestratorService {
  private readonly logger = new Logger(PipelineOrchestratorService.name);

  /** Callback registered by the gateway/distribution layer to attempt assignment */
  private distributionCallback:
    | ((queueId: string) => void)
    | null = null;

  constructor(
    private readonly taskStore: TaskStoreService,
    private readonly queueManager: QueueManagerService,
    @Inject(forwardRef(() => RuleEngineService))
    private readonly ruleEngine: RuleEngineService,
    @Inject(forwardRef(() => PipelineService))
    private readonly pipelineService: PipelineService,
    private readonly eventStore: EventStoreService,
  ) {
    this.logger.log('Pipeline Orchestrator initialized');
  }

  /**
   * Register a callback that will be invoked when new tasks are enqueued.
   * The AgentGateway or DistributionEngine registers this on startup
   * so that task assignment is attempted immediately after enqueue.
   */
  onTaskEnqueued(callback: (queueId: string) => void): void {
    this.distributionCallback = callback;
  }

  /**
   * Ingest a single task through the pipeline.
   * This is the ONLY way tasks should enter the system.
   */
  async ingestTask(input: TaskIngestionInput): Promise<OrchestrationResult> {
    const { pipelineId, taskData, source, sourceId } = input;

    // === Step 0: Pipeline lookup ===
    const pipeline = this.pipelineService.getPipelineById(pipelineId);
    if (!pipeline) {
      return {
        success: false,
        status: 'REJECTED',
        error: `Pipeline not found: ${pipelineId}`,
      };
    }

    if (!pipeline.enabled) {
      return {
        success: false,
        status: 'REJECTED',
        error: `Pipeline is disabled: ${pipeline.name}`,
      };
    }

    // === Step 1: VALIDATE ===

    // Check work type is allowed by pipeline
    if (
      pipeline.allowedWorkTypes.length > 0 &&
      !pipeline.allowedWorkTypes.includes(taskData.workType)
    ) {
      return {
        success: false,
        status: 'REJECTED',
        error: `Work type "${taskData.workType}" not allowed by pipeline "${pipeline.name}"`,
      };
    }

    // Deduplicate by external ID
    if (
      taskData.externalId &&
      (await this.taskStore.hasExternalId(taskData.externalId))
    ) {
      return {
        success: false,
        status: 'DUPLICATE',
        error: `Duplicate external ID: ${taskData.externalId}`,
      };
    }

    // Validate required fields
    if (!taskData.title) {
      return {
        success: false,
        status: 'REJECTED',
        error: 'Task title is required',
      };
    }

    // === Step 2: CREATE task record ===
    const now = new Date().toISOString();
    const taskId = this.taskStore.generateTaskId();

    const task: Task = {
      id: taskId,
      externalId: taskData.externalId,
      workType: taskData.workType || pipeline.defaults?.workType || 'GENERAL',
      title: taskData.title,
      description: taskData.description,
      payloadUrl: taskData.payloadUrl || '',
      displayMode: (taskData.metadata?.['_displayMode'] as Task['displayMode']) || undefined,
      metadata: {
        ...taskData.metadata,
        _source: source,
        _sourceId: sourceId || '',
        _pipelineId: pipelineId,
      },
      priority: taskData.priority ?? pipeline.defaults?.priority ?? 5,
      skills: taskData.skills || [],
      queueId: undefined,
      queue: taskData.queue,
      status: 'PENDING' as TaskStatus,
      createdAt: now,
      availableAt: now,
      reservationTimeout:
        pipeline.defaults?.reservationTimeoutSeconds ?? 60,
      actions: this.getDefaultActions(taskData.workType),
    };

    const createdTask = await this.taskStore.create(task);

    // Emit task.ingested event (fire-and-forget)
    void this.eventStore.emit({
      eventType: 'task.ingested',
      aggregateId: createdTask.id,
      aggregateType: 'task',
      payload: { source, sourceId, pipelineId, workType: createdTask.workType, priority: createdTask.priority },
      pipelineId,
    });

    // === Step 3: TRANSFORM via Rule Engine ===
    const { task: transformedTask, results } =
      this.ruleEngine.evaluateTask(createdTask);

    const matchedRules = results.reduce(
      (sum, r) => sum + r.matchedCount,
      0
    );
    if (matchedRules > 0) {
      // Persist rule engine modifications
      await this.taskStore.update(transformedTask.id, transformedTask);
      this.logger.debug(
        `Rules applied to ${createdTask.id}: ${matchedRules} rule(s) matched, ` +
          `priority: ${createdTask.priority} → ${transformedTask.priority}`
      );
    }

    // === Step 4: ROUTE via Pipeline routing rules ===
    const routingResult = this.pipelineService.routeTask(
      pipelineId,
      taskData
    );

    if (routingResult.error) {
      // No route found — send to DLQ
      const queuedTask = this.createQueuedTask(
        transformedTask,
        pipelineId,
        'dlq',
        pipeline.sla?.maxQueueWaitTime
      );
      await this.queueManager.moveToDLQ(
        queuedTask,
        `routing_failed: ${routingResult.error}`
      );
      await this.taskStore.updateStatus(createdTask.id, 'PENDING' as TaskStatus);

      return {
        success: false,
        taskId: createdTask.id,
        status: 'DLQ',
        error: routingResult.error,
        diagnostics: routingResult.diagnostics,
      };
    }

    if (!routingResult.queueId) {
      // Hold behavior — task created but not queued
      return {
        success: true,
        taskId: createdTask.id,
        status: 'HELD',
        diagnostics: routingResult.diagnostics,
      };
    }

    // === Step 5: ENQUEUE in the target priority queue ===
    const targetQueueId = routingResult.queueId;

    const queuedTask = this.createQueuedTask(
      transformedTask,
      pipelineId,
      targetQueueId,
      pipeline.sla?.maxQueueWaitTime
    );

    await this.queueManager.enqueue(targetQueueId, queuedTask);
    await this.taskStore.updateStatus(createdTask.id, 'PENDING' as TaskStatus, {
      queueId: targetQueueId,
      metadata: {
        ...transformedTask.metadata,
        _queueId: targetQueueId,
      },
    });

    this.logger.log(
      `Task ${createdTask.id} ingested → pipeline "${pipeline.name}" → queue "${targetQueueId}" ` +
        `(priority: ${transformedTask.priority}, source: ${source})`
    );

    // === Step 6: SIGNAL distribution layer ===
    if (this.distributionCallback) {
      try {
        this.distributionCallback(targetQueueId);
      } catch (err) {
        this.logger.warn(
          `Distribution callback failed for queue ${targetQueueId}: ${err}`
        );
      }
    }

    return {
      success: true,
      taskId: createdTask.id,
      queueId: targetQueueId,
      ruleId: routingResult.ruleId,
      ruleName: routingResult.ruleName,
      status: 'QUEUED',
      diagnostics: routingResult.diagnostics,
    };
  }

  /**
   * Ingest a batch of tasks. Returns per-task results.
   */
  async ingestBatch(
    inputs: TaskIngestionInput[]
  ): Promise<{ results: OrchestrationResult[]; successCount: number; failCount: number }> {
    const results: OrchestrationResult[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const input of inputs) {
      const result = await this.ingestTask(input);
      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    }

    this.logger.log(
      `Batch ingestion complete: ${successCount} succeeded, ${failCount} failed (${inputs.length} total)`
    );

    return { results, successCount, failCount };
  }

  /**
   * Retry a task from the DLQ by re-ingesting it through the full pipeline.
   */
  async retryFromDLQ(taskId: string): Promise<OrchestrationResult> {
    const dlqEntry = await this.queueManager.removeFromDLQ(taskId);
    if (!dlqEntry) {
      return {
        success: false,
        status: 'REJECTED',
        error: `Task not found in DLQ: ${taskId}`,
      };
    }

    const task = dlqEntry.queuedTask.task;

    // Re-ingest with reset retry count
    const input: TaskIngestionInput = {
      pipelineId: dlqEntry.queuedTask.pipelineId,
      taskData: {
        externalId: task.externalId || '',
        workType: task.workType,
        title: task.title,
        description: task.description,
        priority: task.priority,
        queue: task.queue,
        skills: task.skills,
        payloadUrl: task.payloadUrl,
        metadata: task.metadata || {},
      },
      source: 'manual',
      sourceId: `dlq-retry-${taskId}`,
    };

    // Remove old task from store to allow re-creation
    // (The new ingestion will create a fresh task ID)
    return this.ingestTask(input);
  }

  // === Private Helpers ===

  private createQueuedTask(
    task: Task,
    pipelineId: string,
    queueId: string,
    slaMaxWaitSeconds?: number
  ): QueuedTask {
    const now = new Date().toISOString();
    let slaDeadline: string | undefined;

    if (slaMaxWaitSeconds && slaMaxWaitSeconds > 0) {
      const deadline = new Date(
        Date.now() + slaMaxWaitSeconds * 1000
      );
      slaDeadline = deadline.toISOString();
    }

    return {
      id: task.id,
      pipelineId,
      queueId,
      task,
      priority: task.priority,
      enqueuedAt: now,
      slaDeadline,
      retryCount: 0,
      maxRetries: 3,
    };
  }

  private getDefaultActions(workType: string): TaskAction[] {
    return [
      {
        id: 'complete',
        label: 'Complete',
        type: 'COMPLETE',
        icon: 'check',
        dispositionCode: 'RESOLVED',
        primary: true,
      },
      {
        id: 'transfer',
        label: 'Transfer',
        type: 'TRANSFER',
        icon: 'arrow-right',
      },
      {
        id: 'skip',
        label: 'Skip',
        type: 'COMPLETE',
        icon: 'forward',
        dispositionCode: 'SKIPPED',
      },
    ];
  }
}
