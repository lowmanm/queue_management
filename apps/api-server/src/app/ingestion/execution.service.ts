import { Injectable, Logger } from '@nestjs/common';
import {
  ExecutionResult,
  ExecutionFailure,
  Task,
} from '@nexus-queue/shared-models';
import { RecordStoreService } from './record-store.service';
import { RoutingEngineService } from './routing-engine.service';

/**
 * Runs the execution pipeline: reads records from the store,
 * applies routing rules, and produces Task objects ready for distribution.
 *
 * This is the "Run Now" trigger that connects the upload phase to the
 * task distribution phase.
 */
@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  /** Tasks produced by the most recent execution, ready for agent assignment */
  private pendingTasks: Task[] = [];

  /** Counter for task IDs */
  private taskCounter = 2000;

  constructor(
    private readonly recordStore: RecordStoreService,
    private readonly routingEngine: RoutingEngineService
  ) {}

  /**
   * Execute the routing pipeline for a given upload batch.
   *
   * Steps:
   * 1. Load valid, pending records from the store
   * 2. Apply routing rules to each record
   * 3. Convert routed records into Tasks
   * 4. Store tasks in the pending queue for distribution
   * 5. Return transparent execution result
   */
  execute(uploadId: string): ExecutionResult {
    const executionId = this.generateExecutionId();
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    this.logger.log(`Execution ${executionId} starting for upload ${uploadId}`);

    // --- Step 1: Load records ---
    if (!this.recordStore.hasUpload(uploadId)) {
      this.logger.warn(`Execution ${executionId}: Upload ${uploadId} not found in record store`);
      return this.buildEmptyResult(executionId, uploadId, startedAt, startMs,
        `Execution failed: Upload "${uploadId}" not found in the record store. ` +
        'This upload may not have been persisted. Please re-upload the CSV file.');
    }

    const records = this.recordStore.getExecutableRecords(uploadId);

    if (records.length === 0) {
      const allRecords = this.recordStore.getAllRecords(uploadId);
      const invalidCount = allRecords.filter(
        (r) => r.validationStatus === 'INVALID'
      ).length;
      const alreadyRouted = allRecords.filter(
        (r) => r.executionStatus === 'ROUTED'
      ).length;

      let reason = 'No executable records found.';
      if (invalidCount > 0 && alreadyRouted === 0) {
        reason = `All ${invalidCount} records failed validation during upload. Fix the CSV data and re-upload.`;
      } else if (alreadyRouted > 0) {
        reason = `All ${alreadyRouted} records were already executed in a previous run. Upload new data to execute again.`;
      }

      this.logger.warn(`Execution ${executionId}: 0 records loaded — ${reason}`);
      return this.buildEmptyResult(executionId, uploadId, startedAt, startMs,
        `Execution complete: 0 records loaded. ${reason}`);
    }

    this.logger.log(`Execution ${executionId}: ${records.length} records loaded for routing`);

    // --- Step 2 & 3: Route records and convert to tasks ---
    let routedCount = 0;
    let filteredCount = 0;
    let failedCount = 0;
    const failures: ExecutionFailure[] = [];
    const routedByWorkType: Record<string, number> = {};
    const newTasks: Task[] = [];

    for (const record of records) {
      try {
        const routed = this.routingEngine.routeRecord(record);

        // Persist routing result back to the store
        this.recordStore.updateRecordExecution(uploadId, record.id, {
          executionStatus: routed.executionStatus,
          resolvedWorkType: routed.resolvedWorkType,
          resolvedPriority: routed.resolvedPriority,
          resolvedQueue: routed.resolvedQueue,
        });

        if (routed.executionStatus === 'ROUTED') {
          const taskId = `TASK-${++this.taskCounter}`;
          const task = this.routingEngine.recordToTask(routed, taskId);
          newTasks.push(task);
          routedCount++;

          const wt = routed.resolvedWorkType || 'UNKNOWN';
          routedByWorkType[wt] = (routedByWorkType[wt] || 0) + 1;
        } else {
          filteredCount++;
        }
      } catch (err) {
        failedCount++;
        this.recordStore.updateRecordExecution(uploadId, record.id, {
          executionStatus: 'FAILED',
        });

        if (failures.length < 50) {
          failures.push({
            recordId: record.id,
            row: record.rowNumber,
            reason: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    // --- Step 4: Add tasks to pending queue ---
    this.pendingTasks.push(...newTasks);
    this.logger.log(
      `Execution ${executionId}: ${routedCount} tasks queued, ${filteredCount} filtered, ${failedCount} failed`
    );

    // --- Step 5: Build result ---
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    const message = this.buildExecutionMessage(
      records.length,
      routedCount,
      filteredCount,
      failedCount,
      routedByWorkType
    );

    return {
      executionId,
      uploadId,
      totalRecords: records.length,
      routedRecords: routedCount,
      filteredRecords: filteredCount,
      failedRecords: failedCount,
      startedAt,
      completedAt,
      durationMs,
      message,
      routedByWorkType,
      failures,
    };
  }

  /**
   * Pop the next pending task for agent assignment.
   * Returns null when the queue is empty.
   */
  getNextPendingTask(agentId: string): Task | null {
    if (this.pendingTasks.length === 0) {
      return null;
    }

    // Sort by priority (lower = higher priority)
    this.pendingTasks.sort((a, b) => a.priority - b.priority);

    const task = this.pendingTasks.shift()!;
    const now = new Date().toISOString();

    // Stamp assignment info
    task.status = 'RESERVED';
    task.reservedAt = now;
    task.assignedAgentId = agentId;
    task.assignmentHistory = [{ agentId, assignedAt: now }];

    return task;
  }

  /**
   * Get the number of pending tasks in the queue.
   */
  getPendingTaskCount(): number {
    return this.pendingTasks.length;
  }

  // --- Private ---

  private buildEmptyResult(
    executionId: string,
    uploadId: string,
    startedAt: string,
    startMs: number,
    message: string
  ): ExecutionResult {
    return {
      executionId,
      uploadId,
      totalRecords: 0,
      routedRecords: 0,
      filteredRecords: 0,
      failedRecords: 0,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      message,
      routedByWorkType: {},
      failures: [],
    };
  }

  private buildExecutionMessage(
    total: number,
    routed: number,
    filtered: number,
    failed: number,
    byWorkType: Record<string, number>
  ): string {
    const parts: string[] = [
      `Execution complete: ${total} records processed.`,
    ];

    if (routed > 0) {
      const breakdown = Object.entries(byWorkType)
        .map(([wt, count]) => `${wt}: ${count}`)
        .join(', ');
      parts.push(`${routed} records routed to task queue (${breakdown}).`);
    }
    if (filtered > 0) {
      parts.push(`${filtered} records filtered out by routing rules.`);
    }
    if (failed > 0) {
      parts.push(`${failed} records failed during routing.`);
    }
    if (routed === 0) {
      parts.push(
        'No records were routed. Check that your CSV workType values match the configured routing rules.'
      );
    }

    return parts.join(' ');
  }

  private generateExecutionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `EXE-${timestamp}-${random}`;
  }
}
