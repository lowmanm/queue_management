import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PipelineMetrics, PipelineMetricsSummary } from '@nexus-queue/shared-models';
import { QueueManagerService } from './queue-manager.service';
import { PipelineService } from '../pipelines/pipeline.service';

/**
 * Aggregates real-time pipeline health metrics from QueueManagerService and PipelineService.
 *
 * Registered in ServicesModule so that GatewayModule (which imports ServicesModule)
 * can inject it for periodic WebSocket broadcasts.
 */
@Injectable()
export class PipelineMetricsService {
  private readonly logger = new Logger(PipelineMetricsService.name);

  constructor(
    private readonly queueManager: QueueManagerService,
    @Inject(forwardRef(() => PipelineService))
    private readonly pipelineService: PipelineService,
  ) {}

  /**
   * Compute real-time metrics for a single pipeline.
   * Aggregates across all queues belonging to the pipeline.
   */
  getPipelineMetrics(pipelineId: string): PipelineMetrics | null {
    const pipeline = this.pipelineService.getPipelineById(pipelineId);
    if (!pipeline) return null;

    const queues = this.pipelineService.getQueuesByPipeline(pipelineId);
    const now = new Date().toISOString();

    let tasksInQueue = 0;
    let tasksFailed = 0;
    let totalWaitMs = 0;
    let waitSamples = 0;
    let tasksWithinSla = 0;
    let tasksWithSla = 0;

    for (const queue of queues) {
      const stats = this.queueManager.getQueueStats(queue.id);
      tasksInQueue += stats.depth;
      tasksFailed += stats.dlqCount;

      if (stats.avgWaitTime > 0) {
        totalWaitMs += stats.avgWaitTime * 1000;
        waitSamples++;
      }

      // Estimate SLA compliance from task ages vs SLA deadline
      const queuedTasks = this.queueManager.getQueueTasks(queue.id);
      for (const queuedTask of queuedTasks) {
        if (queuedTask.slaDeadline) {
          tasksWithSla++;
          if (new Date(queuedTask.slaDeadline).getTime() > Date.now()) {
            tasksWithinSla++;
          }
        }
      }
    }

    const slaCompliancePercent = tasksWithSla > 0
      ? Math.round((tasksWithinSla / tasksWithSla) * 100)
      : 100;

    const avgHandleTimeMs = waitSamples > 0
      ? Math.round(totalWaitMs / waitSamples)
      : 0;

    // Use pipeline stats for ingested/completed counts (maintained by PipelineService)
    const tasksIngested = pipeline.stats.totalTasksProcessed;
    const tasksCompleted = pipeline.stats.totalTasksProcessed - tasksInQueue - tasksFailed;

    const errorRatePercent = tasksIngested > 0
      ? Math.round((tasksFailed / tasksIngested) * 100 * 10) / 10
      : 0;

    return {
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      status: pipeline.enabled ? 'active' : 'inactive',
      tasksIngested,
      tasksCompleted: Math.max(0, tasksCompleted),
      tasksInQueue,
      tasksFailed,
      slaCompliancePercent,
      avgHandleTimeMs,
      errorRatePercent,
      lastUpdated: now,
    };
  }

  /**
   * Compute metrics for all pipelines and return as a summary.
   */
  getAllPipelineMetrics(): PipelineMetricsSummary {
    const pipelines = this.pipelineService.getAllPipelines();
    const metrics: PipelineMetrics[] = [];

    let totalIngested = 0;
    let totalCompleted = 0;
    let totalInQueue = 0;
    let totalFailed = 0;

    for (const pipeline of pipelines) {
      const m = this.getPipelineMetrics(pipeline.id);
      if (m) {
        metrics.push(m);
        totalIngested += m.tasksIngested;
        totalCompleted += m.tasksCompleted;
        totalInQueue += m.tasksInQueue;
        totalFailed += m.tasksFailed;
      }
    }

    return {
      pipelines: metrics,
      totalIngested,
      totalCompleted,
      totalInQueue,
      totalFailed,
      lastUpdated: new Date().toISOString(),
    };
  }
}
