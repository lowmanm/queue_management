import { Injectable, Logger } from '@nestjs/common';
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
} from '@nexus-queue/shared-models';

@Injectable()
export class VolumeLoaderService {
  private readonly logger = new Logger(VolumeLoaderService.name);

  // In-memory storage
  private loaders = new Map<string, VolumeLoader>();
  private runs: VolumeLoaderRun[] = [];
  private scheduledIntervals = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.initializeDefaultLoaders();
  }

  private initializeDefaultLoaders(): void {
    // Create a sample GCS loader for demonstration
    const sampleGcsLoader: VolumeLoader = {
      id: 'loader-gcs-orders',
      name: 'GCS Orders Loader',
      description: 'Loads order data from Google Cloud Storage bucket',
      type: 'GCS',
      enabled: false,
      config: {
        type: 'GCS',
        bucket: 'my-orders-bucket',
        pathPrefix: 'incoming/',
        filePattern: '*.csv',
        projectId: 'my-project-id',
      } as GcsConfig,
      schedule: {
        enabled: false,
        type: 'interval',
        intervalMinutes: 15,
      },
      dataFormat: {
        format: 'CSV',
        csvOptions: DEFAULT_CSV_OPTIONS,
        encoding: 'utf-8',
      },
      fieldMappings: [
        { sourceField: 'order_id', targetField: 'externalId', required: true },
        { sourceField: 'order_type', targetField: 'workType', required: true },
        { sourceField: 'customer_name', targetField: 'title', required: true },
        { sourceField: 'priority_level', targetField: 'priority', required: false, defaultValue: '5' },
        { sourceField: 'queue_name', targetField: 'queue', required: false },
      ],
      defaults: {
        workType: 'ORDERS',
        priority: 5,
        payloadUrlTemplate: 'https://orders.example.com/view/{externalId}',
      },
      processingOptions: DEFAULT_PROCESSING_OPTIONS,
      status: 'DISABLED',
      stats: this.createEmptyStats(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create a sample HTTP loader
    const sampleHttpLoader: VolumeLoader = {
      id: 'loader-http-api',
      name: 'REST API Loader',
      description: 'Loads tasks from external REST API',
      type: 'HTTP',
      enabled: false,
      config: {
        type: 'HTTP',
        url: 'https://api.example.com/tasks',
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        authType: 'bearer',
        pagination: {
          type: 'offset',
          paramName: 'offset',
          pageSize: 100,
          maxPages: 10,
        },
      } as HttpConfig,
      schedule: {
        enabled: false,
        type: 'interval',
        intervalMinutes: 30,
      },
      dataFormat: {
        format: 'JSON',
        jsonOptions: {
          dataPath: '$.data',
          linesFormat: false,
        },
        encoding: 'utf-8',
      },
      fieldMappings: [
        { sourceField: 'id', targetField: 'externalId', required: true },
        { sourceField: 'type', targetField: 'workType', required: true },
        { sourceField: 'title', targetField: 'title', required: true },
        { sourceField: 'description', targetField: 'description', required: false },
        { sourceField: 'priority', targetField: 'priority', required: false },
      ],
      defaults: {
        priority: 5,
        payloadUrlTemplate: 'https://app.example.com/task/{externalId}',
      },
      processingOptions: {
        ...DEFAULT_PROCESSING_OPTIONS,
        skipDuplicates: true,
        duplicateStrategy: 'update',
      },
      status: 'DISABLED',
      stats: this.createEmptyStats(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Create a sample local loader for testing
    const sampleLocalLoader: VolumeLoader = {
      id: 'loader-local-test',
      name: 'Local Test Loader',
      description: 'Loads test data from local file system',
      type: 'LOCAL',
      enabled: true,
      config: {
        type: 'LOCAL',
        directory: '/tmp/volume-loader/incoming',
        filePattern: '*.csv',
      } as LocalConfig,
      schedule: {
        enabled: false,
        type: 'interval',
        intervalMinutes: 5,
      },
      dataFormat: {
        format: 'CSV',
        csvOptions: DEFAULT_CSV_OPTIONS,
        encoding: 'utf-8',
      },
      fieldMappings: [
        { sourceField: 'id', targetField: 'externalId', required: true },
        { sourceField: 'type', targetField: 'workType', required: true },
        { sourceField: 'title', targetField: 'title', required: true },
        { sourceField: 'priority', targetField: 'priority', required: false, defaultValue: '5' },
      ],
      defaults: {
        workType: 'TEST',
        priority: 5,
        payloadUrlTemplate: 'https://test.example.com/{externalId}',
      },
      processingOptions: DEFAULT_PROCESSING_OPTIONS,
      status: 'IDLE',
      stats: this.createEmptyStats(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.loaders.set(sampleGcsLoader.id, sampleGcsLoader);
    this.loaders.set(sampleHttpLoader.id, sampleHttpLoader);
    this.loaders.set(sampleLocalLoader.id, sampleLocalLoader);

    this.logger.log(`Initialized ${this.loaders.size} volume loaders`);
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

  deleteLoader(id: string): { success: boolean; error?: string } {
    const loader = this.loaders.get(id);
    if (!loader) {
      return { success: false, error: 'Loader not found' };
    }

    if (loader.status === 'RUNNING') {
      return { success: false, error: 'Cannot delete loader while it is running' };
    }

    this.unscheduleLoader(id);
    this.loaders.delete(id);
    this.logger.log(`Deleted volume loader: ${id}`);

    return { success: true };
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

  private processLoader(
    loader: VolumeLoader,
    run: VolumeLoaderRun,
    request?: TriggerVolumeLoaderRequest
  ): void {
    // Simulate processing delay
    const processingTime = Math.random() * 2000 + 500;

    setTimeout(() => {
      // Simulate results based on loader type
      const isDryRun = request?.dryRun ?? false;

      if (isDryRun) {
        run.status = 'COMPLETED';
        run.recordsFound = 25;
        run.recordsProcessed = 0;
        run.recordsSkipped = 25;
      } else {
        // Simulate varying results
        const totalRecords = Math.floor(Math.random() * 50) + 10;
        const failedRecords = Math.floor(Math.random() * 3);
        const skippedRecords = Math.floor(Math.random() * 5);

        run.recordsFound = totalRecords;
        run.recordsProcessed = totalRecords - failedRecords - skippedRecords;
        run.recordsFailed = failedRecords;
        run.recordsSkipped = skippedRecords;
        run.filesProcessed = ['orders_20240101.csv', 'orders_20240102.csv'];

        if (failedRecords > 0) {
          run.status = 'PARTIAL';
          run.errorLog = Array(failedRecords).fill(null).map((_, i) => ({
            recordId: `record-${i}`,
            rowNumber: Math.floor(Math.random() * totalRecords),
            message: 'Invalid data format',
            field: 'priority',
            value: 'invalid',
            timestamp: new Date().toISOString(),
          }));
        } else {
          run.status = 'COMPLETED';
        }
      }

      run.completedAt = new Date().toISOString();
      run.durationMs = Math.floor(processingTime);

      // Update loader stats
      this.updateLoaderStats(loader, run);

      // Update loader status based on run result
      const runStatus = run.status as string;
      if (runStatus === 'FAILED' || runStatus === 'PARTIAL') {
        loader.status = 'ERROR';
      } else {
        loader.status = loader.enabled ? (loader.schedule?.enabled ? 'SCHEDULED' : 'IDLE') : 'DISABLED';
      }
      this.loaders.set(loader.id, loader);

      this.logger.log(
        `Loader ${loader.id} completed: ${run.recordsProcessed}/${run.recordsFound} records processed`
      );
    }, processingTime);
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
