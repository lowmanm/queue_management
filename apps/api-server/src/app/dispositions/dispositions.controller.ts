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
  Logger,
} from '@nestjs/common';
import { DispositionService } from '../services/disposition.service';
import {
  Disposition,
  CreateDispositionRequest,
  UpdateDispositionRequest,
  DispositionConfig,
  CompleteTaskRequest,
  TaskCompletion,
  DispositionStats,
  Queue,
  WorkType,
} from '@nexus-queue/shared-models';

@Controller('dispositions')
export class DispositionsController {
  private readonly logger = new Logger(DispositionsController.name);

  constructor(private readonly dispositionService: DispositionService) {}

  // ============ Disposition Endpoints ============

  /**
   * Get all dispositions
   */
  @Get()
  getAllDispositions(@Query('activeOnly') activeOnly?: string): Disposition[] {
    if (activeOnly === 'true') {
      return this.dispositionService.getActiveDispositions();
    }
    return this.dispositionService.getAllDispositions();
  }

  /**
   * Get dispositions for a specific context (queue + work type)
   */
  @Get('context')
  getDispositionsForContext(
    @Query('queueId') queueId?: string,
    @Query('workTypeId') workTypeId?: string
  ): Disposition[] {
    return this.dispositionService.getDispositionsForContext(queueId, workTypeId);
  }

  /**
   * Get full configuration for Designer UI
   */
  @Get('config')
  getDispositionConfig(): DispositionConfig {
    return this.dispositionService.getDispositionConfig();
  }

  /**
   * Get a specific disposition by ID
   */
  @Get(':id')
  getDisposition(@Param('id') id: string): Disposition {
    const disposition = this.dispositionService.getDisposition(id);
    if (!disposition) {
      throw new HttpException('Disposition not found', HttpStatus.NOT_FOUND);
    }
    return disposition;
  }

  /**
   * Create a new disposition
   */
  @Post()
  createDisposition(@Body() request: CreateDispositionRequest): Disposition {
    if (!request.code || !request.name || !request.category) {
      throw new HttpException(
        'Code, name, and category are required',
        HttpStatus.BAD_REQUEST
      );
    }

    // Check for duplicate code
    const existing = this.dispositionService.getDispositionByCode(request.code);
    if (existing) {
      throw new HttpException(
        `Disposition with code "${request.code}" already exists`,
        HttpStatus.CONFLICT
      );
    }

    return this.dispositionService.createDisposition(request);
  }

  /**
   * Update an existing disposition
   */
  @Put(':id')
  updateDisposition(
    @Param('id') id: string,
    @Body() request: UpdateDispositionRequest
  ): Disposition {
    const updated = this.dispositionService.updateDisposition(id, request);
    if (!updated) {
      throw new HttpException('Disposition not found', HttpStatus.NOT_FOUND);
    }
    return updated;
  }

  /**
   * Delete (deactivate) a disposition
   */
  @Delete(':id')
  deleteDisposition(@Param('id') id: string): { success: boolean } {
    const success = this.dispositionService.deleteDisposition(id);
    if (!success) {
      throw new HttpException('Disposition not found', HttpStatus.NOT_FOUND);
    }
    return { success };
  }

  /**
   * Reorder dispositions
   */
  @Post('reorder')
  reorderDispositions(@Body() body: { orderedIds: string[] }): Disposition[] {
    if (!body.orderedIds || !Array.isArray(body.orderedIds)) {
      throw new HttpException('orderedIds array is required', HttpStatus.BAD_REQUEST);
    }
    return this.dispositionService.reorderDispositions(body.orderedIds);
  }

  // ============ Queue Endpoints ============

  /**
   * Get all queues
   */
  @Get('queues/all')
  getAllQueues(@Query('activeOnly') activeOnly?: string): Queue[] {
    if (activeOnly === 'true') {
      return this.dispositionService.getActiveQueues();
    }
    return this.dispositionService.getAllQueues();
  }

  // ============ Work Type Endpoints ============

  /**
   * Get all work types
   */
  @Get('work-types/all')
  getAllWorkTypes(@Query('activeOnly') activeOnly?: string): WorkType[] {
    if (activeOnly === 'true') {
      return this.dispositionService.getActiveWorkTypes();
    }
    return this.dispositionService.getAllWorkTypes();
  }

  // ============ Task Completion Endpoints ============

  /**
   * Complete a task with disposition
   */
  @Post('complete')
  completeTask(
    @Body()
    body: CompleteTaskRequest & {
      agentId: string;
      externalId?: string;
      workType: string;
      queue?: string;
      assignedAt: string;
    }
  ): TaskCompletion {
    if (!body.taskId || !body.dispositionId || !body.agentId) {
      throw new HttpException(
        'taskId, dispositionId, and agentId are required',
        HttpStatus.BAD_REQUEST
      );
    }

    const completion = this.dispositionService.completeTask(
      {
        taskId: body.taskId,
        dispositionId: body.dispositionId,
        note: body.note,
      },
      body.agentId,
      {
        externalId: body.externalId,
        workType: body.workType,
        queue: body.queue,
        assignedAt: body.assignedAt,
      }
    );

    if (!completion) {
      throw new HttpException(
        'Failed to complete task. Check disposition exists and note is provided if required.',
        HttpStatus.BAD_REQUEST
      );
    }

    return completion;
  }

  /**
   * Get completions for an agent
   */
  @Get('completions/agent/:agentId')
  getAgentCompletions(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string
  ): TaskCompletion[] {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.dispositionService.getAgentCompletions(agentId, limitNum);
  }

  /**
   * Get all completions (admin)
   */
  @Get('completions/all')
  getAllCompletions(@Query('limit') limit?: string): TaskCompletion[] {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    return this.dispositionService.getAllCompletions(limitNum);
  }

  /**
   * Get disposition usage statistics
   */
  @Get('stats/usage')
  getDispositionStats(): DispositionStats[] {
    return this.dispositionService.getDispositionStats();
  }
}
