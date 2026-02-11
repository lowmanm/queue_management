import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Optional,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { QueueManagerService } from '../services/queue-manager.service';
import {
  CreatePipelineRequest,
  UpdatePipelineRequest,
  CreateQueueRequest,
  UpdateQueueRequest,
  CreateRoutingRuleRequest,
  UpdateRoutingRuleRequest,
} from '@nexus-queue/shared-models';

@Controller('pipelines')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  // ===========================================================================
  // PIPELINE ENDPOINTS
  // ===========================================================================

  @Get()
  getAllPipelines(@Query('summary') summary?: string) {
    if (summary === 'true') {
      return this.pipelineService.getPipelineSummaries();
    }
    return this.pipelineService.getAllPipelines();
  }

  @Get(':id')
  getPipeline(@Param('id') id: string, @Query('details') details?: string) {
    if (details === 'true') {
      const pipeline = this.pipelineService.getPipelineWithDetails(id);
      if (!pipeline) {
        throw new HttpException('Pipeline not found', HttpStatus.NOT_FOUND);
      }
      return pipeline;
    }

    const pipeline = this.pipelineService.getPipelineById(id);
    if (!pipeline) {
      throw new HttpException('Pipeline not found', HttpStatus.NOT_FOUND);
    }
    return pipeline;
  }

  @Post()
  createPipeline(@Body() request: CreatePipelineRequest) {
    const result = this.pipelineService.createPipeline(request);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to create pipeline', HttpStatus.BAD_REQUEST);
    }
    return result.pipeline;
  }

  @Put(':id')
  updatePipeline(@Param('id') id: string, @Body() request: UpdatePipelineRequest) {
    const result = this.pipelineService.updatePipeline(id, request);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to update pipeline', HttpStatus.BAD_REQUEST);
    }
    return result.pipeline;
  }

  @Get(':id/delete-impact')
  getPipelineDeleteImpact(@Param('id') id: string) {
    const impact = this.pipelineService.getPipelineDeleteImpact(id);
    if (!impact.found) {
      throw new HttpException('Pipeline not found', HttpStatus.NOT_FOUND);
    }
    return impact;
  }

  @Delete(':id')
  deletePipeline(@Param('id') id: string, @Query('cascade') cascade?: string) {
    const result = this.pipelineService.deletePipeline(id, cascade === 'true');
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to delete pipeline', HttpStatus.BAD_REQUEST);
    }
    return { success: true };
  }

  @Put(':id/enable')
  enablePipeline(@Param('id') id: string) {
    return this.pipelineService.updatePipeline(id, { enabled: true });
  }

  @Put(':id/disable')
  disablePipeline(@Param('id') id: string) {
    return this.pipelineService.updatePipeline(id, { enabled: false });
  }

  // ===========================================================================
  // QUEUE ENDPOINTS
  // ===========================================================================

  @Get(':id/queues')
  getPipelineQueues(@Param('id') id: string) {
    const pipeline = this.pipelineService.getPipelineById(id);
    if (!pipeline) {
      throw new HttpException('Pipeline not found', HttpStatus.NOT_FOUND);
    }
    return this.pipelineService.getQueuesByPipeline(id);
  }

  @Post(':id/queues')
  createQueue(@Param('id') pipelineId: string, @Body() request: Omit<CreateQueueRequest, 'pipelineId'>) {
    const result = this.pipelineService.createQueue({
      ...request,
      pipelineId,
    });
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to create queue', HttpStatus.BAD_REQUEST);
    }
    return result.queue;
  }

  @Put(':pipelineId/queues/:queueId')
  updateQueue(
    @Param('pipelineId') pipelineId: string,
    @Param('queueId') queueId: string,
    @Body() request: UpdateQueueRequest
  ) {
    // Verify queue belongs to pipeline
    const queue = this.pipelineService.getQueueById(queueId);
    if (!queue || queue.pipelineId !== pipelineId) {
      throw new HttpException('Queue not found in this pipeline', HttpStatus.NOT_FOUND);
    }

    const result = this.pipelineService.updateQueue(queueId, request);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to update queue', HttpStatus.BAD_REQUEST);
    }
    return result.queue;
  }

  @Delete(':pipelineId/queues/:queueId')
  deleteQueue(
    @Param('pipelineId') pipelineId: string,
    @Param('queueId') queueId: string,
    @Query('cascade') cascade?: string,
  ) {
    // Verify queue belongs to pipeline
    const queue = this.pipelineService.getQueueById(queueId);
    if (!queue || queue.pipelineId !== pipelineId) {
      throw new HttpException('Queue not found in this pipeline', HttpStatus.NOT_FOUND);
    }

    const result = this.pipelineService.deleteQueue(queueId, cascade === 'true');
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to delete queue', HttpStatus.BAD_REQUEST);
    }
    return { success: true };
  }

  // ===========================================================================
  // ROUTING RULES ENDPOINTS
  // ===========================================================================

  @Get(':id/routing-rules')
  getRoutingRules(@Param('id') id: string) {
    const pipeline = this.pipelineService.getPipelineById(id);
    if (!pipeline) {
      throw new HttpException('Pipeline not found', HttpStatus.NOT_FOUND);
    }
    return this.pipelineService.getRoutingRules(id);
  }

  @Post(':id/routing-rules')
  createRoutingRule(
    @Param('id') pipelineId: string,
    @Body() request: Omit<CreateRoutingRuleRequest, 'pipelineId'>
  ) {
    const result = this.pipelineService.createRoutingRule({
      ...request,
      pipelineId,
    });
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to create routing rule', HttpStatus.BAD_REQUEST);
    }
    return result.rule;
  }

  @Put(':pipelineId/routing-rules/:ruleId')
  updateRoutingRule(
    @Param('pipelineId') pipelineId: string,
    @Param('ruleId') ruleId: string,
    @Body() request: UpdateRoutingRuleRequest
  ) {
    const result = this.pipelineService.updateRoutingRule(pipelineId, ruleId, request);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to update routing rule', HttpStatus.BAD_REQUEST);
    }
    return result.rule;
  }

  @Delete(':pipelineId/routing-rules/:ruleId')
  deleteRoutingRule(
    @Param('pipelineId') pipelineId: string,
    @Param('ruleId') ruleId: string
  ) {
    const result = this.pipelineService.deleteRoutingRule(pipelineId, ruleId);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to delete routing rule', HttpStatus.BAD_REQUEST);
    }
    return { success: true };
  }

  // ===========================================================================
  // AGENT ACCESS ENDPOINTS
  // ===========================================================================

  @Get(':id/agents')
  getPipelineAgents(@Param('id') id: string) {
    const pipeline = this.pipelineService.getPipelineById(id);
    if (!pipeline) {
      throw new HttpException('Pipeline not found', HttpStatus.NOT_FOUND);
    }
    return this.pipelineService.getAgentAccess(id);
  }

  @Post(':id/agents')
  grantAgentAccess(
    @Param('id') pipelineId: string,
    @Body() body: {
      agentId: string;
      accessLevel: 'full' | 'partial';
      queueIds?: string[];
    }
  ) {
    const result = this.pipelineService.grantAgentAccess(
      body.agentId,
      pipelineId,
      body.accessLevel,
      body.queueIds
    );
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to grant access', HttpStatus.BAD_REQUEST);
    }
    return result.access;
  }

  @Delete(':pipelineId/agents/:agentId')
  revokeAgentAccess(
    @Param('pipelineId') pipelineId: string,
    @Param('agentId') agentId: string
  ) {
    const result = this.pipelineService.revokeAgentAccess(agentId, pipelineId);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to revoke access', HttpStatus.BAD_REQUEST);
    }
    return { success: true };
  }
}

// ===========================================================================
// STANDALONE QUEUE CONTROLLER
// Provides a unified /queues API backed by PipelineService (config) and
// QueueManagerService (live task data).  Replaces the legacy QueuesController.
// ===========================================================================

@Controller('queues')
export class QueueController {
  constructor(
    private readonly pipelineService: PipelineService,
    @Optional() @Inject(forwardRef(() => QueueManagerService))
    private readonly queueManager?: QueueManagerService,
  ) {}

  // --- Static routes (must be before :id) ---

  @Get()
  getAllQueues(@Query('pipelineId') pipelineId?: string) {
    if (pipelineId) {
      return this.pipelineService.getQueuesByPipeline(pipelineId);
    }
    return this.pipelineService.getAllQueues();
  }

  /**
   * Get real-time stats for every queue.
   * Merges pipeline queue config with live QueueManagerService metrics.
   */
  @Get('stats')
  getAllQueueStats() {
    const allQueues = this.pipelineService.getAllQueues();
    return allQueues.map((q: { id: string; name: string; pipelineId: string; enabled: boolean; priority: number }) =>
      this.buildQueueStats(q)
    );
  }

  /**
   * Get aggregate summary across all queues.
   */
  @Get('summary')
  getQueuesSummary() {
    const stats = this.getAllQueueStats();
    const totalWaiting = stats.reduce((sum: number, s: { tasksWaiting: number }) => sum + s.tasksWaiting, 0);
    const totalInProgress = stats.reduce((sum: number, s: { tasksInProgress: number }) => sum + s.tasksInProgress, 0);
    const avgSL = stats.length > 0
      ? Math.round(stats.reduce((sum: number, s: { serviceLevelPercent: number }) => sum + s.serviceLevelPercent, 0) / stats.length)
      : 100;

    return {
      totalQueues: stats.length,
      totalWaiting,
      totalInProgress,
      avgServiceLevel: avgSL,
      healthyQueues: stats.filter((s: { status: string }) => s.status === 'healthy').length,
      warningQueues: stats.filter((s: { status: string }) => s.status === 'warning').length,
      criticalQueues: stats.filter((s: { status: string }) => s.status === 'critical').length,
    };
  }

  // --- Parameterized routes ---

  @Get(':id')
  getQueue(@Param('id') id: string) {
    const queue = this.pipelineService.getQueueById(id);
    if (!queue) {
      throw new HttpException('Queue not found', HttpStatus.NOT_FOUND);
    }
    return queue;
  }

  /**
   * Get real-time stats for a single queue.
   */
  @Get(':id/stats')
  getQueueStats(@Param('id') id: string) {
    const queue = this.pipelineService.getQueueById(id) as
      | { id: string; name: string; pipelineId: string; enabled: boolean; priority: number }
      | undefined;
    if (!queue) {
      throw new HttpException('Queue not found', HttpStatus.NOT_FOUND);
    }
    return this.buildQueueStats(queue);
  }

  /**
   * Get the current depth (number of waiting tasks) for a queue.
   * Returns task summaries so admins can see what's in the queue.
   */
  @Get(':id/tasks')
  getQueueTasks(@Param('id') id: string) {
    if (!this.queueManager) {
      return { depth: 0, tasks: [] };
    }
    const tasks = this.queueManager.getQueueTasks(id);
    return {
      depth: tasks.length,
      tasks: tasks.map((t) => ({
        taskId: t.task.id,
        externalId: t.task.externalId,
        title: t.task.title,
        priority: t.priority,
        enqueuedAt: t.enqueuedAt,
        payloadUrl: t.task.payloadUrl,
        status: t.task.status,
      })),
    };
  }

  // --- Helpers ---

  private buildQueueStats(queue: { id: string; name: string; pipelineId: string; enabled: boolean; priority: number }) {
    const live = this.queueManager?.getQueueStats(queue.id);
    const tasksWaiting = live?.depth ?? 0;
    const oldestTaskAge = live?.oldestTaskAge ?? 0;
    const avgWaitTime = live?.avgWaitTime ?? 0;

    // SLA target defaults to 300s (5 min) if not configured on the pipeline
    const pipeline = this.pipelineService.getPipelineById(queue.pipelineId);
    const slaTarget = pipeline?.sla?.maxQueueWaitTime ?? 300;

    // Service level degrades as oldest task age approaches SLA target
    let serviceLevelPercent = 100;
    if (oldestTaskAge > 0 && slaTarget > 0) {
      const ratio = oldestTaskAge / slaTarget;
      if (ratio <= 0.5) serviceLevelPercent = 100;
      else if (ratio <= 1.0) serviceLevelPercent = Math.round(100 - (ratio - 0.5) * 40);
      else if (ratio <= 2.0) serviceLevelPercent = Math.round(80 - (ratio - 1.0) * 40);
      else serviceLevelPercent = Math.max(0, Math.round(40 - (ratio - 2.0) * 20));
    }

    // Health status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (serviceLevelPercent < 50) status = 'critical';
    else if (serviceLevelPercent < 70) status = 'warning';

    return {
      id: queue.id,
      name: queue.name,
      tasksWaiting,
      tasksInProgress: 0,
      oldestTaskAge,
      avgWaitTime,
      completedToday: 0,
      serviceLevelPercent,
      slaTarget,
      agentsAssigned: 0,
      agentsAvailable: 0,
      status,
    };
  }
}
