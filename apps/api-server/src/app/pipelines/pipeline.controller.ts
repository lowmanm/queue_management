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
} from '@nestjs/common';
import { PipelineService } from './pipeline.service';
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

  @Delete(':id')
  deletePipeline(@Param('id') id: string) {
    const result = this.pipelineService.deletePipeline(id);
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
  deleteQueue(@Param('pipelineId') pipelineId: string, @Param('queueId') queueId: string) {
    // Verify queue belongs to pipeline
    const queue = this.pipelineService.getQueueById(queueId);
    if (!queue || queue.pipelineId !== pipelineId) {
      throw new HttpException('Queue not found in this pipeline', HttpStatus.NOT_FOUND);
    }

    const result = this.pipelineService.deleteQueue(queueId);
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
// ===========================================================================

@Controller('queues')
export class QueueController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  getAllQueues(@Query('pipelineId') pipelineId?: string) {
    if (pipelineId) {
      return this.pipelineService.getQueuesByPipeline(pipelineId);
    }
    return this.pipelineService.getAllQueues();
  }

  @Get(':id')
  getQueue(@Param('id') id: string) {
    const queue = this.pipelineService.getQueueById(id);
    if (!queue) {
      throw new HttpException('Queue not found', HttpStatus.NOT_FOUND);
    }
    return queue;
  }
}
