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
import { TaskSourceService } from '../services/task-source.service';
import {
  TaskSource,
  CsvParseResult,
  PendingOrder,
  TaskQueueStats,
  PendingOrderStatus,
} from '@nexus-queue/shared-models';

@Controller('task-sources')
export class TaskSourcesController {
  private readonly logger = new Logger(TaskSourcesController.name);

  constructor(private readonly taskSourceService: TaskSourceService) {}

  // ============ Source Configuration Endpoints ============

  /**
   * Get all task source configurations
   */
  @Get()
  getAllSources(): TaskSource[] {
    return this.taskSourceService.getAllSources();
  }

  /**
   * Get the currently active source
   */
  @Get('active')
  getActiveSource(): TaskSource | null {
    return this.taskSourceService.getActiveSource();
  }

  /**
   * Get a specific source by ID
   */
  @Get(':id')
  getSource(@Param('id') id: string): TaskSource {
    const source = this.taskSourceService.getSource(id);
    if (!source) {
      throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
    }
    return source;
  }

  /**
   * Create a new task source configuration
   */
  @Post()
  createSource(@Body() source: Partial<TaskSource>): TaskSource {
    return this.taskSourceService.saveSource(source);
  }

  /**
   * Update an existing source configuration
   */
  @Put(':id')
  updateSource(
    @Param('id') id: string,
    @Body() source: Partial<TaskSource>
  ): TaskSource {
    const existing = this.taskSourceService.getSource(id);
    if (!existing) {
      throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
    }
    return this.taskSourceService.saveSource({ ...source, id });
  }

  /**
   * Set a source as the active source
   */
  @Post(':id/activate')
  activateSource(@Param('id') id: string): { success: boolean } {
    const success = this.taskSourceService.setActiveSource(id);
    if (!success) {
      throw new HttpException('Source not found', HttpStatus.NOT_FOUND);
    }
    return { success };
  }

  // ============ CSV Upload Endpoints ============

  /**
   * Upload and parse CSV content
   */
  @Post('upload/csv')
  uploadCsv(
    @Body() body: { content: string; sourceId?: string }
  ): CsvParseResult {
    if (!body.content) {
      throw new HttpException('CSV content is required', HttpStatus.BAD_REQUEST);
    }

    this.logger.log('Received CSV upload');
    const result = this.taskSourceService.parseAndLoadCsv(body.content, body.sourceId);

    if (!result.success) {
      this.logger.error(`CSV parsing failed: ${result.error}`);
    } else {
      this.logger.log(`CSV parsed successfully: ${result.successRows} orders loaded`);
    }

    return result;
  }

  /**
   * Preview URL generation for a sample row
   */
  @Post('preview-url')
  previewUrl(
    @Body() body: { template: string; sampleData: Record<string, string> }
  ): { url: string } {
    const url = this.taskSourceService.buildUrl(body.template, body.sampleData);
    return { url };
  }

  // ============ Order Queue Endpoints ============

  /**
   * Get all orders in the queue
   */
  @Get('orders/all')
  getAllOrders(): PendingOrder[] {
    return this.taskSourceService.getAllOrders();
  }

  /**
   * Get orders by status
   */
  @Get('orders/status/:status')
  getOrdersByStatus(@Param('status') status: PendingOrderStatus): PendingOrder[] {
    return this.taskSourceService.getOrdersByStatus(status);
  }

  /**
   * Get queue statistics
   */
  @Get('orders/stats')
  getQueueStats(): TaskQueueStats {
    return this.taskSourceService.getQueueStats();
  }

  /**
   * Get the next pending order for an agent
   */
  @Post('orders/next')
  getNextOrder(@Body() body: { agentId: string }): PendingOrder | null {
    if (!body.agentId) {
      throw new HttpException('Agent ID is required', HttpStatus.BAD_REQUEST);
    }
    return this.taskSourceService.getNextPendingOrder(body.agentId);
  }

  /**
   * Mark an order as completed
   */
  @Post('orders/:rowIndex/complete')
  completeOrder(@Param('rowIndex') rowIndex: string): { success: boolean } {
    const success = this.taskSourceService.completeOrder(parseInt(rowIndex, 10));
    return { success };
  }

  /**
   * Release an order back to pending
   */
  @Post('orders/:rowIndex/release')
  releaseOrder(@Param('rowIndex') rowIndex: string): { success: boolean } {
    const success = this.taskSourceService.releaseOrder(parseInt(rowIndex, 10));
    return { success };
  }

  /**
   * Clear all orders from the queue
   */
  @Delete('orders')
  clearOrders(): { success: boolean } {
    this.taskSourceService.clearOrders();
    return { success: true };
  }

  /**
   * Check if there are pending orders
   */
  @Get('orders/has-pending')
  hasPendingOrders(): { hasPending: boolean; count: number } {
    const stats = this.taskSourceService.getQueueStats();
    return {
      hasPending: stats.totalPending > 0,
      count: stats.totalPending,
    };
  }
}
