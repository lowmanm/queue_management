import { Injectable, Logger, Inject, forwardRef, Optional } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  VolumeLoader,
  VolumeLoaderType,
  VolumeLoaderConfig,
  VolumeLoaderSchedule,
  DataFormatConfig,
  VolumeFieldMapping,
  VolumeTaskDefaults,
  ProcessingOptions,
  VolumeLoaderStatus,
  VolumeLoaderStats,
  VolumeLoaderRun,
  VolumeLoaderRunStatus,
  VolumeLoaderError,
  VolumeLoaderTestResult,
  VolumeLoaderSummary,
  CreateVolumeLoaderRequest,
  UpdateVolumeLoaderRequest,
  TriggerVolumeLoaderRequest,
  DEFAULT_PROCESSING_OPTIONS,
  DEFAULT_CSV_OPTIONS,
  GcsConfig,
  S3Config,
  HttpConfig,
  LocalConfig,
  CsvFormatOptions,
  Task,
  TaskAction,
  PendingOrder,
  TaskFromSource,
} from '@nexus-queue/shared-models';
import { TaskSourceService } from '../services/task-source.service';
import { PipelineService } from '../pipelines/pipeline.service';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';

/**
 * Represents a parsed record from a data source before task creation
 */
interface ParsedRecord {
  rowIndex: number;
  rawData: Record<string, string>;
  mappedData?: TaskFromSource;
  error?: string;
}

@Injectable()
export class VolumeLoaderService {
  private readonly logger = new Logger(VolumeLoaderService.name);

  // In-memory storage
  private loaders = new Map<string, VolumeLoader>();
  private runs: VolumeLoaderRun[] = [];
  private scheduledIntervals = new Map<string, NodeJS.Timeout>();

  // Staging table: uploaded records waiting to be processed by "Run Now"
  // Key = loaderId, Value = array of mapped record objects
  private stagedRecords = new Map<string, {
    records: TaskFromSource[];
    uploadedAt: string;
    fileName?: string;
  }>();

  // Track processed external IDs to prevent duplicates
  private processedExternalIds = new Set<string>();

  // Task counter for unique IDs
  private taskCounter = 5000;

  constructor(
    @Optional()
    @Inject(forwardRef(() => TaskSourceService))
    private readonly taskSourceService?: TaskSourceService,
    @Optional()
    @Inject(forwardRef(() => PipelineService))
    private readonly pipelineService?: PipelineService,
    @Optional()
    @Inject(forwardRef(() => PipelineOrchestratorService))
    private readonly orchestrator?: PipelineOrchestratorService
  ) {
    this.initializeDefaultLoaders();
  }

  private initializeDefaultLoaders(): void {
    // No default loaders - start with empty state
    // Users create loaders through the UI wizard
    this.logger.log('Volume loader service initialized (no default loaders)');
  }

  private createEmptyStats(): VolumeLoaderStats {
    return {
      totalRuns: 0,
      totalRecordsProcessed: 0,
      totalRecordsFailed: 0,
      totalFilesProcessed: 0,
      averageRecordsPerRun: 0,
      averageProcessingTime: 0,
      successRate: 100,
    };
  }

  private generateId(): string {
    return `loader-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }

  private generateRunId(): string {
    return `run-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }

  // ==========================================================================
  // CRUD OPERATIONS
  // ==========================================================================

  getAllLoaders(): VolumeLoader[] {
    return Array.from(this.loaders.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getLoaderById(id: string): VolumeLoader | undefined {
    return this.loaders.get(id);
  }

  getLoadersByType(type: VolumeLoaderType): VolumeLoader[] {
    return this.getAllLoaders().filter((l) => l.type === type);
  }

  getEnabledLoaders(): VolumeLoader[] {
    return this.getAllLoaders().filter((l) => l.enabled);
  }

  createLoader(request: CreateVolumeLoaderRequest): {
    success: boolean;
    loader?: VolumeLoader;
    error?: string;
  } {
    // Validate name uniqueness
    const existing = this.getAllLoaders().find(
      (l) => l.name.toLowerCase() === request.name.toLowerCase()
    );
    if (existing) {
      return { success: false, error: `Loader with name "${request.name}" already exists` };
    }

    // Validate config type matches loader type
    if (request.config.type !== request.type) {
      return { success: false, error: 'Config type must match loader type' };
    }

    const now = new Date().toISOString();
    const loader: VolumeLoader = {
      id: this.generateId(),
      name: request.name,
      description: request.description,
      type: request.type,
      enabled: false,
      pipelineId: request.pipelineId,
      config: request.config,
      schedule: request.schedule,
      dataFormat: request.dataFormat,
      fieldMappings: request.fieldMappings,
      defaults: request.defaults,
      processingOptions: request.processingOptions,
      status: 'DISABLED',
      stats: this.createEmptyStats(),
      createdAt: now,
      updatedAt: now,
    };

    this.loaders.set(loader.id, loader);
    this.logger.log(`Created volume loader: ${loader.id} (${loader.name})`);

    return { success: true, loader };
  }

  updateLoader(
    id: string,
    updates: UpdateVolumeLoaderRequest
  ): { success: boolean; loader?: VolumeLoader; error?: string } {
    const loader = this.loaders.get(id);
    if (!loader) {
      return { success: false, error: 'Loader not found' };
    }

    // Validate name uniqueness if updating name
    if (updates.name && updates.name !== loader.name) {
      const existing = this.getAllLoaders().find(
        (l) => l.name.toLowerCase() === updates.name!.toLowerCase() && l.id !== id
      );
      if (existing) {
        return { success: false, error: `Loader with name "${updates.name}" already exists` };
      }
    }

    // Cannot update while running
    if (loader.status === 'RUNNING') {
      return { success: false, error: 'Cannot update loader while it is running' };
    }

    const updated: VolumeLoader = {
      ...loader,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.enabled !== undefined && { enabled: updates.enabled }),
      ...(updates.pipelineId !== undefined && { pipelineId: updates.pipelineId }),
      ...(updates.config !== undefined && { config: updates.config }),
      ...(updates.schedule !== undefined && { schedule: updates.schedule }),
      ...(updates.dataFormat !== undefined && { dataFormat: updates.dataFormat }),
      ...(updates.fieldMappings !== undefined && { fieldMappings: updates.fieldMappings }),
      ...(updates.defaults !== undefined && { defaults: updates.defaults }),
      ...(updates.processingOptions !== undefined && { processingOptions: updates.processingOptions }),
      updatedAt: new Date().toISOString(),
    };

    // Update status based on enabled flag
    if (updates.enabled !== undefined) {
      if (updates.enabled && updated.schedule?.enabled) {
        updated.status = 'SCHEDULED';
        this.scheduleLoader(updated);
      } else if (updates.enabled) {
        updated.status = 'IDLE';
      } else {
        updated.status = 'DISABLED';
        this.unscheduleLoader(id);
      }
    }

    this.loaders.set(id, updated);
    this.logger.log(`Updated volume loader: ${id}`);

    return { success: true, loader: updated };
  }

  deleteLoader(id: string, cascade = false): { success: boolean; error?: string; cascadeResults?: string[] } {
    const loader = this.loaders.get(id);
    if (!loader) {
      return { success: false, error: 'Loader not found' };
    }

    if (loader.status === 'RUNNING') {
      return { success: false, error: 'Cannot delete loader while it is running' };
    }

    const cascadeResults: string[] = [];

    // Cascade: also delete the associated pipeline (and its children)
    if (cascade && loader.pipelineId && this.pipelineService) {
      const impact = this.pipelineService.getPipelineDeleteImpact(loader.pipelineId);
      if (impact.found) {
        const pipelineResult = this.pipelineService.deletePipeline(loader.pipelineId, true);
        if (pipelineResult.success) {
          cascadeResults.push(
            `Deleted pipeline "${impact.pipelineName}" with ${impact.queueCount} queue(s) and ${impact.routingRuleCount} routing rule(s)`
          );
        } else {
          cascadeResults.push(`Failed to delete pipeline: ${pipelineResult.error}`);
        }
      }
    }

    // Remove associated run history
    const runsBefore = this.runs.length;
    this.runs = this.runs.filter((r) => r.loaderId !== id);
    const runsRemoved = runsBefore - this.runs.length;
    if (runsRemoved > 0) {
      cascadeResults.push(`Removed ${runsRemoved} run history record(s)`);
    }

    this.unscheduleLoader(id);
    this.loaders.delete(id);
    this.logger.log(`Deleted volume loader: ${id}${cascade ? ' (cascade)' : ''}`);

    return { success: true, cascadeResults };
  }

  /**
   * Get an impact summary for cascade-deleting a data source (loader).
   */
  getLoaderDeleteImpact(id: string): {
    found: boolean;
    loaderName?: string;
    runCount: number;
    pipelineName?: string;
    queueCount: number;
    routingRuleCount: number;
  } {
    const loader = this.loaders.get(id);
    if (!loader) {
      return { found: false, runCount: 0, queueCount: 0, routingRuleCount: 0 };
    }

    const runCount = this.runs.filter((r) => r.loaderId === id).length;

    let pipelineName: string | undefined;
    let queueCount = 0;
    let routingRuleCount = 0;

    if (loader.pipelineId && this.pipelineService) {
      const impact = this.pipelineService.getPipelineDeleteImpact(loader.pipelineId);
      if (impact.found) {
        pipelineName = impact.pipelineName;
        queueCount = impact.queueCount;
        routingRuleCount = impact.routingRuleCount;
      }
    }

    return {
      found: true,
      loaderName: loader.name,
      runCount,
      pipelineName,
      queueCount,
      routingRuleCount,
    };
  }

  // ==========================================================================
  // LOADER CONTROL
  // ==========================================================================

  enableLoader(id: string): { success: boolean; loader?: VolumeLoader; error?: string } {
    return this.updateLoader(id, { enabled: true });
  }

  disableLoader(id: string): { success: boolean; loader?: VolumeLoader; error?: string } {
    return this.updateLoader(id, { enabled: false });
  }

  private scheduleLoader(loader: VolumeLoader): void {
    if (!loader.schedule?.enabled) return;

    // Clear existing schedule
    this.unscheduleLoader(loader.id);

    if (loader.schedule.type === 'interval' && loader.schedule.intervalMinutes) {
      const intervalMs = loader.schedule.intervalMinutes * 60 * 1000;
      const interval = setInterval(() => {
        this.runLoader(loader.id, 'scheduled');
      }, intervalMs);

      this.scheduledIntervals.set(loader.id, interval);

      // Calculate next run time
      const nextRun = new Date(Date.now() + intervalMs).toISOString();
      loader.nextRunAt = nextRun;
      this.loaders.set(loader.id, loader);

      this.logger.log(`Scheduled loader ${loader.id} to run every ${loader.schedule.intervalMinutes} minutes`);
    }
  }

  private unscheduleLoader(id: string): void {
    const interval = this.scheduledIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.scheduledIntervals.delete(id);
      this.logger.log(`Unscheduled loader ${id}`);
    }
  }

  // ==========================================================================
  // LOADER EXECUTION
  // ==========================================================================

  triggerRun(
    id: string,
    request?: TriggerVolumeLoaderRequest
  ): { success: boolean; run?: VolumeLoaderRun; error?: string } {
    const loader = this.loaders.get(id);
    if (!loader) {
      return { success: false, error: 'Loader not found' };
    }

    if (loader.status === 'RUNNING') {
      return { success: false, error: 'Loader is already running' };
    }

    const run = this.runLoader(id, 'manual', request);
    return { success: true, run };
  }

  private runLoader(
    id: string,
    trigger: 'manual' | 'scheduled' | 'api',
    request?: TriggerVolumeLoaderRequest
  ): VolumeLoaderRun {
    const loader = this.loaders.get(id)!;
    const runId = this.generateRunId();
    const startedAt = new Date().toISOString();

    // Create run record
    const run: VolumeLoaderRun = {
      id: runId,
      loaderId: id,
      status: 'RUNNING',
      startedAt,
      trigger,
      filesProcessed: [],
      recordsFound: 0,
      recordsProcessed: 0,
      recordsFailed: 0,
      recordsSkipped: 0,
      errorLog: [],
    };

    this.runs.push(run);

    // Update loader status
    loader.status = 'RUNNING';
    loader.lastRunAt = startedAt;
    this.loaders.set(id, loader);

    // Simulate processing (in real implementation, this would be async)
    this.processLoader(loader, run, request);

    return run;
  }

  private async processLoader(
    loader: VolumeLoader,
    run: VolumeLoaderRun,
    request?: TriggerVolumeLoaderRequest
  ): Promise<void> {
    const startTime = Date.now();
    const isDryRun = request?.dryRun ?? false;

    try {
      // Priority 1: Process staged records from CSV upload
      const staged = this.stagedRecords.get(loader.id);
      if (staged && staged.records.length > 0) {
        this.processStagedRecords(loader, run, staged.records, isDryRun);
        // Clear staging table after processing
        if (!isDryRun) {
          this.stagedRecords.delete(loader.id);
        }
      } else {
        // Priority 2: Type-specific source processing
        switch (loader.type) {
          case 'LOCAL':
            await this.processLocalLoader(loader, run, isDryRun);
            break;
          case 'GCS':
          case 'S3':
          case 'SFTP':
          case 'HTTP':
            // No staged data and no real connector — nothing to process
            run.status = 'COMPLETED';
            run.recordsFound = 0;
            run.recordsProcessed = 0;
            this.logger.warn(
              `No staged records for loader ${loader.name}. Upload a CSV file first, then click Run Now.`
            );
            break;
          default:
            throw new Error(`Unsupported loader type: ${loader.type}`);
        }
      }
    } catch (error) {
      run.status = 'FAILED';
      run.errorLog.push({
        recordId: 'SYSTEM',
        rowNumber: 0,
        message: error instanceof Error ? error.message : 'Unknown error',
        field: 'system',
        value: '',
        timestamp: new Date().toISOString(),
      });
      this.logger.error(`Loader ${loader.id} failed: ${error}`);
    }

    // Calculate duration and finalize
    run.completedAt = new Date().toISOString();
    run.durationMs = Date.now() - startTime;

    // Update loader stats
    this.updateLoaderStats(loader, run);

    // Update loader status based on run result
    if (run.status === 'FAILED') {
      loader.status = 'ERROR';
    } else if (run.status === 'PARTIAL') {
      loader.status = 'ERROR';
    } else {
      loader.status = loader.enabled ? (loader.schedule?.enabled ? 'SCHEDULED' : 'IDLE') : 'DISABLED';
    }
    this.loaders.set(loader.id, loader);

    this.logger.log(
      `Loader ${loader.id} completed: ${run.recordsProcessed}/${run.recordsFound} records processed, ` +
      `${run.recordsFailed} failed, ${run.recordsSkipped} skipped`
    );
  }

  /**
   * Process a LOCAL file system loader - reads CSV files from a directory
   */
  private async processLocalLoader(
    loader: VolumeLoader,
    run: VolumeLoaderRun,
    isDryRun: boolean
  ): Promise<void> {
    const config = loader.config as LocalConfig;
    const directory = config.directory;
    const filePattern = config.filePattern || '*.csv';

    this.logger.log(`Processing LOCAL loader from directory: ${directory}`);

    // Check if directory exists
    if (!fs.existsSync(directory)) {
      // Create directory for convenience in development
      try {
        fs.mkdirSync(directory, { recursive: true });
        this.logger.log(`Created directory: ${directory}`);
      } catch (err) {
        throw new Error(`Directory does not exist and could not be created: ${directory}`);
      }
    }

    // Find matching files
    const files = this.findMatchingFiles(directory, filePattern);
    if (files.length === 0) {
      run.status = 'COMPLETED';
      this.logger.log(`No files matching pattern "${filePattern}" found in ${directory}`);
      return;
    }

    this.logger.log(`Found ${files.length} file(s) to process`);

    // Process each file
    for (const file of files) {
      const filePath = path.join(directory, file);
      try {
        const records = await this.parseFile(filePath, loader);
        run.filesProcessed.push(file);
        run.recordsFound += records.length;

        // Process each record
        for (const record of records) {
          if (record.error) {
            run.recordsFailed++;
            run.errorLog.push({
              recordId: record.rawData['externalId'] || `row-${record.rowIndex}`,
              rowNumber: record.rowIndex,
              message: record.error,
              field: 'mapping',
              value: '',
              timestamp: new Date().toISOString(),
            });
            continue;
          }

          if (!record.mappedData) {
            run.recordsFailed++;
            continue;
          }

          // Check for duplicates if enabled
          if (loader.processingOptions?.skipDuplicates && record.mappedData.externalId) {
            if (this.processedExternalIds.has(record.mappedData.externalId)) {
              run.recordsSkipped++;
              continue;
            }
          }

          if (!isDryRun) {
            // Create task in the task pipeline
            this.createTaskFromRecord(loader, record.mappedData, record.rowIndex);

            // Track processed ID
            if (record.mappedData.externalId) {
              this.processedExternalIds.add(record.mappedData.externalId);
            }
          }

          run.recordsProcessed++;
        }

        // Move file to processed directory if configured
        if (!isDryRun && config.archiveDirectory) {
          this.archiveFile(filePath, config.archiveDirectory);
        }
      } catch (err) {
        run.errorLog.push({
          recordId: file,
          rowNumber: 0,
          message: err instanceof Error ? err.message : 'Failed to process file',
          field: 'file',
          value: file,
          timestamp: new Date().toISOString(),
        });
        this.logger.error(`Failed to process file ${file}: ${err}`);
      }
    }

    // Determine final status
    if (run.recordsFailed > 0 && run.recordsProcessed > 0) {
      run.status = 'PARTIAL';
    } else if (run.recordsFailed > 0 && run.recordsProcessed === 0) {
      run.status = 'FAILED';
    } else {
      run.status = 'COMPLETED';
    }
  }

  /**
   * Simulated processing for unimplemented loader types.
   * Generates mock records from the loader's field mappings and routes them
   * through the pipeline so tasks actually reach queues.
   */
  private processSimulated(
    loader: VolumeLoader,
    run: VolumeLoaderRun,
    isDryRun: boolean
  ): void {
    const recordCount = Math.floor(Math.random() * 20) + 10;
    run.recordsFound = recordCount;
    run.filesProcessed = ['simulated_data.csv'];

    if (!loader.fieldMappings || loader.fieldMappings.length === 0) {
      // No schema configured — fall back to counts-only simulation
      run.recordsProcessed = isDryRun ? 0 : recordCount;
      run.recordsSkipped = isDryRun ? recordCount : 0;
      run.status = 'COMPLETED';
      this.logger.log(
        `Simulated processing for ${loader.type} loader (no field mappings configured)`
      );
      return;
    }

    // Generate mock records from the loader's field mappings
    for (let i = 0; i < recordCount; i++) {
      const rawData: Record<string, string> = {};
      for (const mapping of loader.fieldMappings) {
        rawData[mapping.sourceField] = this.generateMockValue(
          mapping.sourceField,
          mapping.detectedType || 'string',
          i
        );
      }

      try {
        const mappedData = this.applyFieldMappings(rawData, loader);

        if (!isDryRun) {
          this.createTaskFromRecord(loader, mappedData, i + 1);
          if (mappedData.externalId) {
            this.processedExternalIds.add(mappedData.externalId);
          }
        }

        run.recordsProcessed++;
      } catch (err) {
        run.recordsFailed++;
        run.errorLog.push({
          recordId: `mock-${i + 1}`,
          rowNumber: i + 1,
          message: err instanceof Error ? err.message : 'Mock record error',
          field: 'mapping',
          value: '',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Determine status
    if (run.recordsFailed > 0 && run.recordsProcessed > 0) {
      run.status = 'PARTIAL';
    } else if (run.recordsFailed > 0 && run.recordsProcessed === 0) {
      run.status = 'FAILED';
    } else {
      run.status = 'COMPLETED';
    }

    this.logger.log(
      `Simulated ${loader.type} loader: ${run.recordsProcessed}/${run.recordsFound} records routed through pipeline`
    );
  }

  /**
   * Generate a plausible mock value for a field based on its detected type.
   */
  private generateMockValue(
    fieldName: string,
    fieldType: string,
    index: number
  ): string {
    switch (fieldType) {
      case 'number':
      case 'integer':
      case 'currency':
        return String(Math.floor(Math.random() * 1000) + 1);
      case 'boolean':
        return index % 2 === 0 ? 'true' : 'false';
      case 'email':
        return `user${index + 1}@example.com`;
      case 'url':
        return `https://example.com/item/${index + 1}`;
      case 'date':
        return new Date(Date.now() - index * 86400000).toISOString().split('T')[0];
      case 'datetime':
      case 'timestamp':
        return new Date(Date.now() - index * 86400000).toISOString();
      default:
        // For string fields, use field name as prefix for identifiable mock data
        return `${fieldName.replace(/[_-]/g, '')}-${String(index + 1).padStart(4, '0')}`;
    }
  }

  // ==========================================================================
  // STAGED RECORD PROCESSING (CSV Upload → "Run Now")
  // ==========================================================================

  /**
   * Process previously staged records through the pipeline.
   * This is the core path: CSV Upload stages → Run Now routes → tasks reach queues → agents.
   */
  private processStagedRecords(
    loader: VolumeLoader,
    run: VolumeLoaderRun,
    records: TaskFromSource[],
    isDryRun: boolean
  ): void {
    run.recordsFound = records.length;
    run.filesProcessed = ['staged_upload'];

    let recordsRouted = 0;
    let recordsUnrouted = 0;
    const routingSummary: Record<string, { ruleName: string; count: number; queueId: string }> = {};
    let firstDiagnostics: any = null;

    for (let i = 0; i < records.length; i++) {
      const taskData = records[i];

      try {
        if (isDryRun) {
          run.recordsProcessed++;
          continue;
        }

        // Route through pipeline (V2 or legacy path)
        const taskResult = this.createTaskFromRecord(loader, taskData, i + 1);

        if (taskResult?.routed) {
          recordsRouted++;
          if (taskResult.ruleId) {
            if (!routingSummary[taskResult.ruleId]) {
              routingSummary[taskResult.ruleId] = {
                ruleName: taskResult.ruleName || taskResult.ruleId,
                count: 0,
                queueId: taskResult.queueId || '',
              };
            }
            routingSummary[taskResult.ruleId].count++;
          }
        } else {
          recordsUnrouted++;
          if (!firstDiagnostics && taskResult?.diagnostics) {
            firstDiagnostics = taskResult.diagnostics;
          }
        }

        // Track processed ID for deduplication
        if (taskData.externalId) {
          this.processedExternalIds.add(taskData.externalId);
        }

        run.recordsProcessed++;
      } catch (err) {
        run.recordsFailed++;
        run.errorLog.push({
          recordId: taskData.externalId || `row-${i + 1}`,
          rowNumber: i + 1,
          message: err instanceof Error ? err.message : 'Processing error',
          field: 'routing',
          value: '',
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Store routing results on the run for the frontend to poll
    (run as any).recordsRouted = recordsRouted;
    (run as any).recordsUnrouted = recordsUnrouted;
    (run as any).routingSummary = routingSummary;
    if (firstDiagnostics) {
      (run as any).routingDiagnostics = {
        sampleAvailableFields: firstDiagnostics.availableFields || [],
        firstUnmatchedReason: firstDiagnostics.ruleResults
          ?.flatMap((r: any) => r.conditionResults)
          ?.find((c: any) => !c.matched && c.reason)?.reason,
      };
    }

    // Determine status
    if (run.recordsFailed > 0 && run.recordsProcessed > 0) {
      run.status = 'PARTIAL';
    } else if (run.recordsFailed > 0 && run.recordsProcessed === 0) {
      run.status = 'FAILED';
    } else {
      run.status = 'COMPLETED';
    }

    this.logger.log(
      `Processed ${run.recordsProcessed}/${run.recordsFound} staged records for ${loader.name}: ` +
      `${recordsRouted} routed, ${recordsUnrouted} unrouted, ${run.recordsFailed} failed`
    );
  }

  /**
   * Find files matching a glob pattern in a directory
   */
  private findMatchingFiles(directory: string, pattern: string): string[] {
    try {
      const allFiles = fs.readdirSync(directory);

      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(`^${regexPattern}$`, 'i');

      return allFiles.filter(file => {
        const stat = fs.statSync(path.join(directory, file));
        return stat.isFile() && regex.test(file);
      });
    } catch (err) {
      this.logger.error(`Failed to list files in ${directory}: ${err}`);
      return [];
    }
  }

  /**
   * Parse a file and return records with field mappings applied
   */
  private async parseFile(
    filePath: string,
    loader: VolumeLoader
  ): Promise<ParsedRecord[]> {
    const content = fs.readFileSync(filePath, loader.dataFormat.encoding as BufferEncoding || 'utf-8');

    if (loader.dataFormat.format === 'CSV') {
      return this.parseCsvContent(content, loader);
    } else if (loader.dataFormat.format === 'JSON') {
      return this.parseJsonContent(content, loader);
    } else {
      throw new Error(`Unsupported data format: ${loader.dataFormat.format}`);
    }
  }

  /**
   * Parse CSV content and apply field mappings
   */
  private parseCsvContent(content: string, loader: VolumeLoader): ParsedRecord[] {
    const records: ParsedRecord[] = [];
    const csvOptions = loader.dataFormat.csvOptions || DEFAULT_CSV_OPTIONS;
    const delimiter = csvOptions.delimiter || ',';
    const hasHeader = csvOptions.hasHeader !== false;

    const lines = content.trim().split('\n');
    if (lines.length === 0) return records;

    // Parse header row
    const headerLine = lines[0];
    const headers = this.parseCsvLine(headerLine, delimiter);

    const startIndex = hasHeader ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCsvLine(line, delimiter);
      const rawData: Record<string, string> = {};

      headers.forEach((header, index) => {
        rawData[header] = values[index] || '';
      });

      try {
        const mappedData = this.applyFieldMappings(rawData, loader);
        records.push({
          rowIndex: i + 1,
          rawData,
          mappedData,
        });
      } catch (err) {
        records.push({
          rowIndex: i + 1,
          rawData,
          error: err instanceof Error ? err.message : 'Mapping error',
        });
      }
    }

    return records;
  }

  /**
   * Parse a single CSV line, handling quoted values
   */
  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Parse JSON content and apply field mappings
   */
  private parseJsonContent(content: string, loader: VolumeLoader): ParsedRecord[] {
    const records: ParsedRecord[] = [];
    const jsonOptions = loader.dataFormat.jsonOptions;

    try {
      let data = JSON.parse(content);

      // Extract data from path if specified (e.g., "$.data" or "data.items")
      if (jsonOptions?.dataPath) {
        const pathParts = jsonOptions.dataPath.replace(/^\$\.?/, '').split('.');
        for (const part of pathParts) {
          if (part && data[part] !== undefined) {
            data = data[part];
          }
        }
      }

      // Ensure data is an array
      if (!Array.isArray(data)) {
        data = [data];
      }

      data.forEach((item: Record<string, unknown>, index: number) => {
        const rawData: Record<string, string> = {};
        Object.entries(item).forEach(([key, value]) => {
          rawData[key] = String(value ?? '');
        });

        try {
          const mappedData = this.applyFieldMappings(rawData, loader);
          records.push({
            rowIndex: index + 1,
            rawData,
            mappedData,
          });
        } catch (err) {
          records.push({
            rowIndex: index + 1,
            rawData,
            error: err instanceof Error ? err.message : 'Mapping error',
          });
        }
      });
    } catch (err) {
      throw new Error(`Failed to parse JSON: ${err}`);
    }

    return records;
  }

  /**
   * Apply field mappings to raw data to create task data
   */
  private applyFieldMappings(
    rawData: Record<string, string>,
    loader: VolumeLoader
  ): TaskFromSource {
    const metadata: Record<string, string> = {};
    let externalId = '';
    let workType = loader.defaults?.workType || 'GENERAL';
    let title = '';
    let description = '';
    let priority = loader.defaults?.priority || 5;
    let queue = loader.defaults?.queueId;
    let skills = loader.defaults?.skills;

    // Apply each field mapping
    for (const mapping of loader.fieldMappings) {
      let value = rawData[mapping.sourceField];

      // Apply default if value is missing
      if ((value === undefined || value === '') && mapping.defaultValue !== undefined) {
        value = mapping.defaultValue;
      }

      // Check required fields
      if ((value === undefined || value === '') && mapping.required) {
        throw new Error(`Required field "${mapping.sourceField}" is missing`);
      }

      if (value === undefined || value === '') continue;

      // Apply transformations
      const transformedValue = this.applyTransformation(value, mapping.transform);

      // Map to target field
      switch (mapping.targetField) {
        case 'externalId':
          externalId = String(transformedValue);
          break;
        case 'workType':
          workType = String(transformedValue);
          break;
        case 'title':
          title = String(transformedValue);
          break;
        case 'description':
          description = String(transformedValue);
          break;
        case 'priority':
          priority = typeof transformedValue === 'number'
            ? transformedValue
            : parseInt(String(transformedValue), 10) || 5;
          break;
        case 'queue':
        case 'queueId':
          queue = String(transformedValue);
          break;
        case 'skills':
          skills = Array.isArray(transformedValue)
            ? transformedValue
            : String(transformedValue).split(',').map(s => s.trim());
          break;
        case 'metadata':
          // Add to metadata using source field name as key
          metadata[mapping.sourceField] = String(value);
          break;
        case 'payloadUrl':
          // This will be handled by template below
          break;
      }
    }

    // Also add all raw data to metadata for URL template resolution
    Object.entries(rawData).forEach(([key, value]) => {
      if (!metadata[key]) {
        metadata[key] = value;
      }
    });

    // Generate title if not mapped
    if (!title) {
      title = externalId ? `Task ${externalId}` : `Task ${Date.now()}`;
    }

    // Build the payload URL from template using ALL available data
    const urlData = {
      ...metadata,
      externalId,
      workType,
      title,
      priority: String(priority),
      queue: queue || '',
    };
    const payloadUrl = this.buildUrlFromTemplate(
      loader.defaults?.payloadUrlTemplate || '',
      urlData
    );

    return {
      externalId,
      workType,
      title,
      description,
      priority,
      queue,
      skills,
      payloadUrl,
      metadata,
    };
  }

  /**
   * Apply a transformation to a field value
   * Transformations use the FieldTransformConfig structure with type and params
   */
  private applyTransformation(
    value: string,
    transform?: VolumeFieldMapping['transform']
  ): string | number | string[] {
    if (!transform) return value;

    const { type, params } = transform;

    switch (type) {
      case 'uppercase':
        return value.toUpperCase();
      case 'lowercase':
        return value.toLowerCase();
      case 'trim':
        return value.trim();
      case 'number':
        return parseFloat(value) || 0;
      case 'date':
        // Parse and format date
        const date = new Date(value);
        return isNaN(date.getTime()) ? value : date.toISOString();
      case 'regex_extract':
        const pattern = params?.pattern as string;
        if (pattern) {
          const match = value.match(new RegExp(pattern));
          return match ? match[1] || match[0] : value;
        }
        return value;
      case 'template':
        const template = params?.template as string;
        if (template) {
          return template.replace(/\{value\}/g, value);
        }
        return value;
      case 'lookup':
        const lookupTable = params?.lookupTable as Record<string, string>;
        const defaultValue = params?.defaultValue as string;
        if (lookupTable && lookupTable[value]) {
          return lookupTable[value];
        }
        return defaultValue || value;
      case 'split':
        const delimiter = (params?.delimiter as string) || ',';
        return value.split(delimiter).map(s => s.trim());
      default:
        return value;
    }
  }

  /**
   * Build a URL from a template using placeholder substitution
   * Placeholders use {fieldName} syntax, e.g., https://example.com/order/{externalId}
   */
  private buildUrlFromTemplate(
    template: string,
    data: Record<string, string>
  ): string {
    if (!template) return '';

    let url = template;

    // Find all {placeholder} patterns
    const placeholders = template.match(/\{([^}]+)\}/g) || [];

    for (const placeholder of placeholders) {
      const key = placeholder.slice(1, -1); // Remove braces

      // Try different case variations
      const value = data[key]
        || data[key.toLowerCase()]
        || data[key.toUpperCase()]
        || data[this.toCamelCase(key)]
        || data[this.toSnakeCase(key)]
        || '';

      // Replace placeholder with URL-encoded value
      url = url.replace(placeholder, encodeURIComponent(value));
    }

    return url;
  }

  /**
   * Convert string to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
  }

  /**
   * Convert string to snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
  }

  /**
   * Create a task from a parsed record and route through the pipeline.
   *
   * V2 path (preferred): PipelineOrchestratorService handles the full lifecycle:
   *   validate → create task → transform → route → enqueue → notify agents
   *
   * If V2 is not available, logs a clear error so we know what's missing.
   */
  private createTaskFromRecord(
    loader: VolumeLoader,
    taskData: TaskFromSource,
    rowIndex: number
  ): { routed: boolean; ruleId?: string; ruleName?: string; queueId?: string; diagnostics?: any } | null {
    // Guard: pipeline must be configured
    if (!loader.pipelineId) {
      this.logger.warn(
        `Loader "${loader.name}" has no pipeline assigned. Task ${taskData.externalId} cannot be routed.`
      );
      return { routed: false };
    }

    // V2 path: use PipelineOrchestrator (validate → transform → route → enqueue → notify)
    if (this.orchestrator) {
      const result = this.orchestrator.ingestTask({
        pipelineId: loader.pipelineId,
        taskData,
        source: 'volume_loader',
        sourceId: loader.id,
      });

      if (result.success) {
        this.logger.debug(
          `[V2] Task ${result.taskId} ingested: ${taskData.externalId} → ` +
          `${result.queueId ? `queue "${result.queueId}"` : `status: ${result.status}`}`
        );
        return {
          routed: !!result.queueId,
          ruleId: result.ruleId,
          ruleName: result.ruleName,
          queueId: result.queueId,
          diagnostics: result.diagnostics,
        };
      } else {
        this.logger.warn(
          `[V2] Ingestion failed for ${taskData.externalId}: ${result.status} - ${result.error}`
        );
        return { routed: false, diagnostics: result.diagnostics };
      }
    }

    // Orchestrator not available — this means the dependency chain is broken
    this.logger.error(
      'PipelineOrchestratorService is not injected. Tasks cannot be routed. ' +
      'Check that ServicesModule is imported in VolumeLoaderModule.'
    );
    return { routed: false };
  }

  /**
   * Add a pending order to the task source service's queue
   */
  private addToPendingOrders(order: PendingOrder): void {
    if (this.taskSourceService) {
      // Add source marker to metadata for tracking
      if (order.taskData?.metadata) {
        order.taskData.metadata['_source'] = 'volume-loader';
      }
      this.taskSourceService.addPendingOrder(order);
    }
  }

  /**
   * Archive a processed file to the archive directory
   */
  private archiveFile(filePath: string, archiveDirectory: string): void {
    try {
      if (!fs.existsSync(archiveDirectory)) {
        fs.mkdirSync(archiveDirectory, { recursive: true });
      }

      const filename = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveName = `${timestamp}_${filename}`;
      const archivePath = path.join(archiveDirectory, archiveName);

      fs.renameSync(filePath, archivePath);
      this.logger.log(`Archived file to: ${archivePath}`);
    } catch (err) {
      this.logger.error(`Failed to archive file ${filePath}: ${err}`);
    }
  }

  private updateLoaderStats(loader: VolumeLoader, run: VolumeLoaderRun): void {
    const stats = loader.stats;
    stats.totalRuns++;
    stats.totalRecordsProcessed += run.recordsProcessed;
    stats.totalRecordsFailed += run.recordsFailed;
    stats.totalFilesProcessed += run.filesProcessed.length;
    stats.lastRunDuration = run.durationMs;

    // Calculate averages
    stats.averageRecordsPerRun = Math.round(stats.totalRecordsProcessed / stats.totalRuns);
    stats.averageProcessingTime = Math.round(
      (stats.averageProcessingTime * (stats.totalRuns - 1) + (run.durationMs || 0)) / stats.totalRuns
    );
    stats.successRate = Math.round(
      (stats.totalRecordsProcessed / (stats.totalRecordsProcessed + stats.totalRecordsFailed)) * 100
    );

    loader.stats = stats;
    this.loaders.set(loader.id, loader);
  }

  // ==========================================================================
  // RUN HISTORY
  // ==========================================================================

  getLoaderRuns(loaderId: string, limit = 50): VolumeLoaderRun[] {
    return this.runs
      .filter((r) => r.loaderId === loaderId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  getRunById(runId: string): VolumeLoaderRun | undefined {
    return this.runs.find((r) => r.id === runId);
  }

  getAllRuns(limit = 100): VolumeLoaderRun[] {
    return this.runs
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  // ==========================================================================
  // TESTING & VALIDATION
  // ==========================================================================

  testConnection(id: string): { success: boolean; result?: VolumeLoaderTestResult; error?: string } {
    const loader = this.loaders.get(id);
    if (!loader) {
      return { success: false, error: 'Loader not found' };
    }

    // Simulate connection test based on type
    const result: VolumeLoaderTestResult = {
      connectionSuccess: true,
      filesFound: [],
      sampleData: [],
      headers: [],
      validationErrors: [],
    };

    switch (loader.type) {
      case 'GCS':
        result.filesFound = ['orders_2024-01-01.csv', 'orders_2024-01-02.csv'];
        result.sampleData = [
          { order_id: '12345', customer_name: 'John Doe', priority_level: '5' },
          { order_id: '12346', customer_name: 'Jane Smith', priority_level: '3' },
        ];
        result.headers = ['order_id', 'customer_name', 'priority_level', 'order_type'];
        break;

      case 'HTTP':
        result.sampleData = [
          { id: 'task-1', type: 'ORDER', title: 'Process order #12345', priority: 5 },
          { id: 'task-2', type: 'RETURN', title: 'Handle return #98765', priority: 3 },
        ];
        result.headers = ['id', 'type', 'title', 'description', 'priority'];
        break;

      case 'LOCAL':
        result.filesFound = ['test_data.csv', 'sample_orders.csv'];
        result.sampleData = [
          { id: '1', type: 'TEST', title: 'Test Task 1', priority: '5' },
        ];
        result.headers = ['id', 'type', 'title', 'priority'];
        break;

      default:
        result.connectionSuccess = false;
        result.connectionError = 'Unsupported loader type';
    }

    return { success: true, result };
  }

  validateFieldMappings(
    id: string,
    mappings: VolumeFieldMapping[]
  ): { success: boolean; errors?: string[] } {
    const loader = this.loaders.get(id);
    if (!loader) {
      return { success: false, errors: ['Loader not found'] };
    }

    const errors: string[] = [];

    // Check required fields
    const hasExternalId = mappings.some((m) => m.targetField === 'externalId' && m.required);
    if (!hasExternalId) {
      errors.push('A required mapping for externalId is recommended');
    }

    const hasWorkType = mappings.some((m) => m.targetField === 'workType');
    if (!hasWorkType && !loader.defaults?.workType) {
      errors.push('Either a workType mapping or default workType is required');
    }

    const hasTitle = mappings.some((m) => m.targetField === 'title');
    if (!hasTitle) {
      errors.push('A title mapping is required');
    }

    // Check for duplicate target fields (except metadata)
    const targetCounts = new Map<string, number>();
    mappings.forEach((m) => {
      if (m.targetField !== 'metadata') {
        targetCounts.set(m.targetField, (targetCounts.get(m.targetField) || 0) + 1);
      }
    });
    targetCounts.forEach((count, field) => {
      if (count > 1) {
        errors.push(`Duplicate mapping for ${field}`);
      }
    });

    return { success: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }

  // ==========================================================================
  // DIRECT CSV UPLOAD (Unified Data Loading)
  // ==========================================================================

  /**
   * Process CSV content uploaded directly through the API.
   * Uses the loader's field mappings and defaults to create tasks.
   *
   * This method parses CSV content, applies field mappings, and stores
   * the mapped records in an in-memory staging table. Records are NOT
   * immediately routed — that happens when the user clicks "Run Now".
   *
   * @param loaderId - The loader ID with configured field mappings
   * @param csvContent - The CSV content as a string
   * @param dryRun - If true, parse only (preview); if false, stage records for processing
   * @returns Processing result with counts and any errors
   */
  async processDirectCsvUpload(
    loaderId: string,
    csvContent: string,
    dryRun = false
  ): Promise<{
    success: boolean;
    recordsFound: number;
    recordsProcessed: number;
    recordsFailed: number;
    recordsSkipped: number;
    recordsStaged: number;
    errors: Array<{ row: number; error: string }>;
    samplePayloadUrls?: string[];
    error?: string;
  }> {
    const loader = this.loaders.get(loaderId);
    if (!loader) {
      return {
        success: false,
        recordsFound: 0,
        recordsProcessed: 0,
        recordsFailed: 0,
        recordsSkipped: 0,
        recordsStaged: 0,
        errors: [],
        error: 'Loader not found',
      };
    }

    this.logger.log(
      `Processing CSV upload for loader ${loaderId} (dryRun: ${dryRun})`
    );

    const result = {
      success: true,
      recordsFound: 0,
      recordsProcessed: 0,
      recordsFailed: 0,
      recordsSkipped: 0,
      recordsStaged: 0,
      errors: [] as Array<{ row: number; error: string }>,
      samplePayloadUrls: [] as string[],
    };

    try {
      // Parse CSV using the loader's configuration
      const records = this.parseCsvContent(csvContent, loader);
      result.recordsFound = records.length;

      const stagedBatch: TaskFromSource[] = [];

      // Parse and validate each record
      for (const record of records) {
        if (record.error) {
          result.recordsFailed++;
          result.errors.push({ row: record.rowIndex, error: record.error });
          continue;
        }

        if (!record.mappedData) {
          result.recordsFailed++;
          result.errors.push({ row: record.rowIndex, error: 'Failed to map data' });
          continue;
        }

        // Check for duplicates
        if (loader.processingOptions?.skipDuplicates && record.mappedData.externalId) {
          if (this.processedExternalIds.has(record.mappedData.externalId)) {
            result.recordsSkipped++;
            continue;
          }
        }

        // Collect sample URLs for preview (first 5)
        if (result.samplePayloadUrls.length < 5 && record.mappedData.payloadUrl) {
          result.samplePayloadUrls.push(record.mappedData.payloadUrl);
        }

        // Stage the mapped record (don't route yet)
        if (!dryRun) {
          stagedBatch.push(record.mappedData);
        }

        result.recordsProcessed++;
      }

      // Store staged records for later "Run Now" processing
      if (!dryRun && stagedBatch.length > 0) {
        this.stagedRecords.set(loaderId, {
          records: stagedBatch,
          uploadedAt: new Date().toISOString(),
        });
        result.recordsStaged = stagedBatch.length;
        this.logger.log(
          `Staged ${stagedBatch.length} records for loader ${loader.name} — ready for "Run Now"`
        );
      }

      this.logger.log(
        `CSV upload complete: ${result.recordsFound} found, ${result.recordsProcessed} valid, ` +
        `${result.recordsFailed} failed, ${result.recordsSkipped} skipped, ` +
        `${result.recordsStaged} staged`
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to process CSV upload: ${error}`);
      return {
        ...result,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get the current staging status for a loader.
   */
  getStagedRecordCount(loaderId: string): number {
    return this.stagedRecords.get(loaderId)?.records.length ?? 0;
  }

  // ==========================================================================
  // SUMMARY & ANALYTICS
  // ==========================================================================

  getSummary(): VolumeLoaderSummary {
    const loaders = this.getAllLoaders();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const runsToday = this.runs.filter((r) => new Date(r.startedAt) >= today);
    const recordsToday = runsToday.reduce((sum, r) => sum + r.recordsProcessed, 0);

    return {
      totalLoaders: loaders.length,
      activeLoaders: loaders.filter((l) => l.enabled).length,
      runningLoaders: loaders.filter((l) => l.status === 'RUNNING').length,
      errorLoaders: loaders.filter((l) => l.status === 'ERROR').length,
      recordsLoadedToday: recordsToday,
      runsToday: runsToday.length,
    };
  }
}
