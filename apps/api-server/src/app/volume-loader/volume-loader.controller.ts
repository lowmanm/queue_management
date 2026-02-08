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
  // LOADER CRUD
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
   * Get a specific loader by ID
   */
  @Get(':id')
  getLoader(@Param('id') id: string) {
    const loader = this.volumeLoaderService.getLoaderById(id);
    if (!loader) {
      throw new HttpException('Loader not found', HttpStatus.NOT_FOUND);
    }
    return loader;
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
   * Delete a volume loader
   */
  @Delete(':id')
  deleteLoader(@Param('id') id: string) {
    const result = this.volumeLoaderService.deleteLoader(id);
    if (!result.success) {
      throw new HttpException(result.error || 'Failed to delete loader', HttpStatus.BAD_REQUEST);
    }
    return { success: true, message: 'Loader deleted' };
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
      throw new HttpException(result.error || 'Failed to trigger run', HttpStatus.BAD_REQUEST);
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
}
