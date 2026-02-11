import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  UploadResult,
  ExecutionResult,
  RecordStoreState,
  RoutingRule,
} from '@nexus-queue/shared-models';
import { CsvIngestionService } from './csv-ingestion.service';
import { ExecutionService } from './execution.service';
import { RecordStoreService } from './record-store.service';
import { RoutingEngineService } from './routing-engine.service';

@Controller('ingestion')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(
    private readonly csvIngestion: CsvIngestionService,
    private readonly execution: ExecutionService,
    private readonly recordStore: RecordStoreService,
    private readonly routingEngine: RoutingEngineService
  ) {}

  /**
   * POST /api/ingestion/upload
   *
   * Accepts raw CSV text and a file name. Parses, validates, and stores
   * records in memory. Returns transparent feedback about every row.
   */
  @Post('upload')
  upload(
    @Body() body: { fileName: string; csvText: string }
  ): UploadResult {
    if (!body.csvText || typeof body.csvText !== 'string') {
      throw new BadRequestException(
        'Request body must include "csvText" as a string containing CSV data.'
      );
    }

    const fileName = body.fileName || 'unknown.csv';
    this.logger.log(`Upload request received: "${fileName}" (${body.csvText.length} chars)`);

    return this.csvIngestion.ingest(fileName, body.csvText);
  }

  /**
   * POST /api/ingestion/execute/:uploadId
   *
   * Runs the routing pipeline for a specific upload batch.
   * Converts records into Tasks and queues them for agent assignment.
   */
  @Post('execute/:uploadId')
  execute(@Param('uploadId') uploadId: string): ExecutionResult {
    this.logger.log(`Execute request received for upload: ${uploadId}`);
    return this.execution.execute(uploadId);
  }

  /**
   * POST /api/ingestion/execute
   *
   * "Run Now" — executes the most recent upload batch.
   */
  @Post('execute')
  executeLatest(): ExecutionResult {
    const uploadId = this.recordStore.getLatestUploadId();
    if (!uploadId) {
      return {
        executionId: 'NONE',
        uploadId: 'NONE',
        totalRecords: 0,
        routedRecords: 0,
        filteredRecords: 0,
        failedRecords: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        message:
          'Execution failed: No uploads found in the record store. Please upload a CSV file first.',
        routedByWorkType: {},
        failures: [],
      };
    }

    this.logger.log(`Execute latest: resolved to upload ${uploadId}`);
    return this.execution.execute(uploadId);
  }

  /**
   * GET /api/ingestion/store/state
   *
   * Returns the current in-memory store state summary.
   */
  @Get('store/state')
  getStoreState(): RecordStoreState {
    return this.recordStore.getStoreState();
  }

  /**
   * GET /api/ingestion/queue/count
   *
   * Returns the number of pending tasks produced by execution.
   */
  @Get('queue/count')
  getQueueCount(): { pendingTasks: number } {
    return { pendingTasks: this.execution.getPendingTaskCount() };
  }

  /**
   * GET /api/ingestion/rules
   *
   * Returns the current routing rules.
   */
  @Get('rules')
  getRules(): RoutingRule[] {
    return this.routingEngine.getRules();
  }

  /**
   * POST /api/ingestion/rules
   *
   * Replaces the routing rules.
   */
  @Post('rules')
  setRules(@Body() body: { rules: RoutingRule[] }): { message: string } {
    if (!Array.isArray(body.rules)) {
      throw new BadRequestException('"rules" must be an array of RoutingRule objects.');
    }
    this.routingEngine.setRules(body.rules);
    return { message: `${body.rules.length} routing rules configured.` };
  }

  /**
   * GET /api/ingestion/records?uploadId=xxx
   *
   * Returns all records for a given upload (for debugging/admin).
   */
  @Get('records')
  getRecords(@Query('uploadId') uploadId?: string) {
    const id = uploadId || this.recordStore.getLatestUploadId();
    if (!id) {
      return { records: [], message: 'No uploads found.' };
    }
    return {
      uploadId: id,
      records: this.recordStore.getAllRecords(id),
    };
  }
}
