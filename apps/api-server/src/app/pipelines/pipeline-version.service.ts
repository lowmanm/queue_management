import { Injectable, Logger } from '@nestjs/common';
import { Pipeline, PipelineVersion } from '@nexus-queue/shared-models';

/**
 * Tracks pipeline configuration history.
 * Snapshots are created whenever a pipeline is updated, allowing rollback.
 *
 * In-memory for Phase 3 (Phase 4 will persist to PostgreSQL).
 */
@Injectable()
export class PipelineVersionService {
  private readonly logger = new Logger(PipelineVersionService.name);

  /** versionId counter for stable unique IDs */
  private versionCounter = 0;

  /** pipelineId → ordered list of versions (oldest first) */
  private versions = new Map<string, PipelineVersion[]>();

  /** Maximum versions to retain per pipeline */
  private readonly MAX_VERSIONS = 20;

  /**
   * Snapshot the current state of a pipeline before it is modified.
   * Called by PipelineService before persisting an update.
   */
  snapshotPipeline(pipeline: Pipeline, changedBy: string, changeNote: string): PipelineVersion {
    const versionId = `ver-${Date.now().toString(36)}-${(++this.versionCounter).toString(36)}`;

    const version: PipelineVersion = {
      versionId,
      pipelineId: pipeline.id,
      snapshot: JSON.parse(JSON.stringify(pipeline)) as Pipeline, // deep clone
      createdAt: new Date().toISOString(),
      changedBy,
      changeNote,
    };

    const history = this.versions.get(pipeline.id) ?? [];
    history.push(version);

    // Trim history to max versions (remove oldest)
    if (history.length > this.MAX_VERSIONS) {
      history.splice(0, history.length - this.MAX_VERSIONS);
    }

    this.versions.set(pipeline.id, history);

    this.logger.debug(
      `Snapshot created for pipeline "${pipeline.name}" (${pipeline.id}) — version ${versionId}`
    );

    return version;
  }

  /**
   * Get the version history for a pipeline, newest first.
   */
  getVersions(pipelineId: string): PipelineVersion[] {
    const history = this.versions.get(pipelineId) ?? [];
    return [...history].reverse();
  }

  /**
   * Retrieve a specific version snapshot by ID.
   * Returns null if the version does not exist.
   */
  getVersion(pipelineId: string, versionId: string): PipelineVersion | null {
    const history = this.versions.get(pipelineId) ?? [];
    return history.find((v) => v.versionId === versionId) ?? null;
  }

  /**
   * Return the pipeline configuration from a specific version.
   * The caller (PipelineService) is responsible for persisting the rollback.
   */
  rollback(pipelineId: string, versionId: string): Pipeline | null {
    const version = this.getVersion(pipelineId, versionId);
    if (!version) {
      this.logger.warn(`Rollback failed: version ${versionId} not found for pipeline ${pipelineId}`);
      return null;
    }

    this.logger.log(`Rolling back pipeline ${pipelineId} to version ${versionId}`);
    return JSON.parse(JSON.stringify(version.snapshot)) as Pipeline;
  }
}
