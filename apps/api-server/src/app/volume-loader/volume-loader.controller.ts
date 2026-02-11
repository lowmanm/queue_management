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
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { VolumeLoaderService } from './volume-loader.service';
import {
  VolumeLoaderType,
  CreateVolumeLoaderRequest,
  UpdateVolumeLoaderRequest,
  TriggerVolumeLoaderRequest,
  VolumeFieldMapping,
} from '@nexus-queue/shared-models';

@Controller('volume-loaders')
export class VolumeLoaderController {
  private readonly logger = new Logger(VolumeLoaderController.name);

  constructor(private readonly volumeLoaderService: VolumeLoaderService) {}

  // ==========================================================================
  // STATIC ROUTES (must be declared before :id to avoid route collision)
  // ==========================================================================

  /**
   * Get all volume loaders
   */
  @Get()
  getAllLoaders(@Query('type') type?: VolumeLoaderType) {
    if (type) {
      return this.volumeLoaderService.getLoadersByType(type);
    }
    return this.volumeLoaderService.getAllLoaders();
  }

  /**
   * Get enabled loaders only
   */
  @Get('enabled')
  getEnabledLoaders() {
    return this.volumeLoaderService.getEnabledLoaders();
  }

  /**
   * Get summary statistics
   */
  @Get('summary')
  getSummary() {
    return this.volumeLoaderService.getSummary();
  }

  /**
   * Get all runs across all loaders
   */
  @Get('runs')
  getAllRuns(@Query('limit') limit?: string) {
    return this.volumeLoaderService.getAllRuns(limit ? parseInt(limit, 10) : 100);
  }

  /**
   * Get service dependency diagnostics (useful for debugging).
   */
  @Get('diagnostics/status')
  getDiagnostics() {
    return this.volumeLoaderService.getDiagnostics();
  }

  // ==========================================================================
  // PARAMETERIZED ROUTES (:id)
  // ==========================================================================

  /**
   * Get a specific loader by ID
   */
  @Get(':id')
  getLoader(@Param('id') id: string) {
    const loader = this.volumeLoaderService.getLoaderById(id);
    if (!loader) {
      throw new HttpException(
        { statusCode: HttpStatus.NOT_FOUND, message: 'Loader not found', error: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }
    // Include staged record count so frontend knows if "Run Now" has data to process
    return {
      ...loader,
      stagedRecordCount: this.volumeLoaderService.getStagedRecordCount(id),
    };
  }

  /**
   * Create a new volume loader
   */
  @Post()
  createLoader(@Body() request: CreateVolumeLoaderRequest) {
    const result = this.volumeLoaderService.createLoader(request);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to create loader', HttpStatus.BAD_REQUEST);
    }
    return result.loader;
  }

  /**
   * Update a volume loader
   */
  @Put(':id')
  updateLoader(@Param('id') id: string, @Body() updates: UpdateVolumeLoaderRequest) {
    const result = this.volumeLoaderService.updateLoader(id, updates);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to update loader', HttpStatus.BAD_REQUEST);
    }
    return result.loader;
  }

  /**
   * Get delete impact summary for a volume loader
   */
  @Get(':id/delete-impact')
  getDeleteImpact(@Param('id') id: string) {
    const impact = this.volumeLoaderService.getLoaderDeleteImpact(id);
    if (!impact.found) {
      throw new HttpException('Loader not found', HttpStatus.NOT_FOUND);
    }
    return impact;
  }

  /**
   * Delete a volume loader. Use ?cascade=true to also delete the associated pipeline.
   */
  @Delete(':id')
  deleteLoader(@Param('id') id: string, @Query('cascade') cascade?: string) {
    const result = this.volumeLoaderService.deleteLoader(id, cascade === 'true');
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to delete loader', HttpStatus.BAD_REQUEST);
    }
    return { success: true, message: 'Loader deleted', cascadeResults: result.cascadeResults };
  }

  // ==========================================================================
  // LOADER CONTROL
  // ==========================================================================

  /**
   * Enable a volume loader
   */
  @Post(':id/enable')
  enableLoader(@Param('id') id: string) {
    const result = this.volumeLoaderService.enableLoader(id);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to enable loader', HttpStatus.BAD_REQUEST);
    }
    return result.loader;
  }

  /**
   * Disable a volume loader
   */
  @Post(':id/disable')
  disableLoader(@Param('id') id: string) {
    const result = this.volumeLoaderService.disableLoader(id);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to disable loader', HttpStatus.BAD_REQUEST);
    }
    return result.loader;
  }

  /**
   * Trigger a manual run
   */
  @Post(':id/run')
  triggerRun(@Param('id') id: string, @Body() request?: TriggerVolumeLoaderRequest) {
    const result = this.volumeLoaderService.triggerRun(id, request);
    if (!result.success) {
      const msg = result.error || 'Failed to trigger run';
      const status = msg.includes('not found') ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      throw new HttpException({ statusCode: status, message: msg }, status);
    }
    return result.run;
  }

  // ==========================================================================
  // RUN HISTORY
  // ==========================================================================

  /**
   * Get runs for a specific loader
   */
  @Get(':id/runs')
  getLoaderRuns(@Param('id') id: string, @Query('limit') limit?: string) {
    const loader = this.volumeLoaderService.getLoaderById(id);
    if (!loader) {
      throw new HttpException('Loader not found', HttpStatus.NOT_FOUND);
    }
    return this.volumeLoaderService.getLoaderRuns(id, limit ? parseInt(limit, 10) : 50);
  }

  /**
   * Get a specific run by ID
   */
  @Get(':id/runs/:runId')
  getRun(@Param('id') id: string, @Param('runId') runId: string) {
    const run = this.volumeLoaderService.getRunById(runId);
    if (!run || run.loaderId !== id) {
      throw new HttpException('Run not found', HttpStatus.NOT_FOUND);
    }
    return run;
  }

  // ==========================================================================
  // TESTING & VALIDATION
  // ==========================================================================

  /**
   * Test connection for a loader
   */
  @Post(':id/test')
  testConnection(@Param('id') id: string) {
    const result = this.volumeLoaderService.testConnection(id);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to test connection', HttpStatus.BAD_REQUEST);
    }
    return result.result;
  }

  /**
   * Validate field mappings for a loader
   */
  @Post(':id/validate-mappings')
  validateMappings(@Param('id') id: string, @Body() body: { mappings: VolumeFieldMapping[] }) {
    const result = this.volumeLoaderService.validateFieldMappings(id, body.mappings);
    return result;
  }

  /**
   * Test routing rules against a loader's staged records or sample data.
   * Returns routing results without creating tasks (dry run).
   */
  @Post(':id/test-routing')
  testRouting(@Param('id') id: string, @Body() body?: { maxRecords?: number }) {
    const result = this.volumeLoaderService.testRouting(
      id,
      body?.maxRecords ?? 10
    );
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to test routing', HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  // ==========================================================================
  // DIRECT CSV UPLOAD (Unified Data Loading)
  // ==========================================================================

  /**
   * Upload CSV content directly to a loader for immediate processing.
   * This endpoint provides a unified way to load data without requiring
   * file system access - useful for browser-based uploads and testing.
   *
   * @param id - The loader ID (must have field mappings configured)
   * @param body - Object containing csvContent and optional dryRun flag
   * @returns Processing result with counts and any errors
   */
  @Post(':id/upload-csv')
  async uploadCsv(
    @Param('id') id: string,
    @Body() body: { csvContent: string; dryRun?: boolean }
  ) {
    const loader = this.volumeLoaderService.getLoaderById(id);
    if (!loader) {
      throw new HttpException('Loader not found', HttpStatus.NOT_FOUND);
    }

    if (!body.csvContent) {
      throw new HttpException('csvContent is required', HttpStatus.BAD_REQUEST);
    }

    // Process the CSV content using the loader's configuration
    const result = await this.volumeLoaderService.processDirectCsvUpload(
      id,
      body.csvContent,
      body.dryRun ?? false
    );

    if (!result.success) {
      throw new HttpException(result.error || 'Failed to process CSV', HttpStatus.BAD_REQUEST);
    }

    return result;
  }
}
