import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Logger,
} from '@nestjs/common';
import { QueuesService, QueueConfig, QueueStats } from './queues.service';

@Controller('queues')
export class QueuesController {
  private readonly logger = new Logger(QueuesController.name);

  constructor(private readonly queuesService: QueuesService) {}

  /**
   * Get all queues
   */
  @Get()
  getAllQueues(@Query('active') activeOnly?: string): QueueConfig[] {
    if (activeOnly === 'true') {
      return this.queuesService.getActiveQueues();
    }
    return this.queuesService.getAllQueues();
  }

  /**
   * Get queue statistics for all queues
   */
  @Get('stats')
  getAllQueueStats(): QueueStats[] {
    return this.queuesService.getAllQueueStats();
  }

  /**
   * Get queue summary (totals)
   */
  @Get('summary')
  getQueuesSummary() {
    return this.queuesService.getQueuesSummary();
  }

  /**
   * Get a specific queue
   */
  @Get(':id')
  getQueue(@Param('id') id: string): QueueConfig | null {
    return this.queuesService.getQueueById(id) || null;
  }

  /**
   * Get statistics for a specific queue
   */
  @Get(':id/stats')
  getQueueStats(@Param('id') id: string): QueueStats | null {
    return this.queuesService.getQueueStats(id);
  }

  /**
   * Create a new queue
   */
  @Post()
  createQueue(
    @Body()
    data: Omit<QueueConfig, 'id' | 'createdAt' | 'updatedAt'>
  ): QueueConfig {
    return this.queuesService.createQueue(data);
  }

  /**
   * Update a queue
   */
  @Put(':id')
  updateQueue(
    @Param('id') id: string,
    @Body() data: Partial<QueueConfig>
  ): QueueConfig | null {
    return this.queuesService.updateQueue(id, data);
  }

  /**
   * Toggle queue active status
   */
  @Post(':id/toggle')
  toggleQueue(@Param('id') id: string): QueueConfig | null {
    return this.queuesService.toggleQueueActive(id);
  }

  /**
   * Delete a queue
   */
  @Delete(':id')
  deleteQueue(@Param('id') id: string): { success: boolean } {
    const deleted = this.queuesService.deleteQueue(id);
    return { success: deleted };
  }
}
