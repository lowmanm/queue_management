import { Injectable, Logger } from '@nestjs/common';
import {
  IngestedRecord,
  RecordStoreState,
} from '@nexus-queue/shared-models';

/**
 * Application-scoped singleton that holds ingested CSV records in memory.
 *
 * This is the central data store for the POC pipeline. It persists records
 * across request boundaries so that Upload and Run operations share state.
 *
 * Lifecycle: Upload → store records here → Run reads from here → routes into task queue.
 */
@Injectable()
export class RecordStoreService {
  private readonly logger = new Logger(RecordStoreService.name);

  /** Primary store: uploadId → records */
  private uploads = new Map<string, IngestedRecord[]>();

  /** Metadata per upload */
  private uploadMeta = new Map<
    string,
    { fileName: string; uploadedAt: string; totalRows: number }
  >();

  /** Track upload order for "most recent" queries */
  private uploadOrder: string[] = [];

  /**
   * Store a batch of records from a CSV upload.
   */
  storeRecords(
    uploadId: string,
    fileName: string,
    records: IngestedRecord[]
  ): void {
    this.uploads.set(uploadId, records);
    this.uploadMeta.set(uploadId, {
      fileName,
      uploadedAt: new Date().toISOString(),
      totalRows: records.length,
    });
    this.uploadOrder.push(uploadId);

    this.logger.log(
      `Stored ${records.length} records for upload ${uploadId} (${fileName})`
    );
  }

  /**
   * Retrieve all valid, pending records for a given upload.
   * These are the records eligible for execution.
   */
  getExecutableRecords(uploadId: string): IngestedRecord[] {
    const records = this.uploads.get(uploadId);
    if (!records) {
      this.logger.warn(`No records found for upload ${uploadId}`);
      return [];
    }
    return records.filter(
      (r) => r.validationStatus === 'VALID' && r.executionStatus === 'PENDING'
    );
  }

  /**
   * Retrieve all records for a given upload (any status).
   */
  getAllRecords(uploadId: string): IngestedRecord[] {
    return this.uploads.get(uploadId) || [];
  }

  /**
   * Update a record's execution status after routing.
   */
  updateRecordExecution(
    uploadId: string,
    recordId: string,
    updates: Partial<IngestedRecord>
  ): void {
    const records = this.uploads.get(uploadId);
    if (!records) return;

    const record = records.find((r) => r.id === recordId);
    if (record) {
      Object.assign(record, updates);
    }
  }

  /**
   * Get the most recent upload ID (for convenience "Run Now" without specifying).
   */
  getLatestUploadId(): string | null {
    return this.uploadOrder.length > 0
      ? this.uploadOrder[this.uploadOrder.length - 1]
      : null;
  }

  /**
   * Check whether an upload exists.
   */
  hasUpload(uploadId: string): boolean {
    return this.uploads.has(uploadId);
  }

  /**
   * Get a summary of the current store state.
   */
  getStoreState(): RecordStoreState {
    const latestId = this.getLatestUploadId();
    const latestMeta = latestId ? this.uploadMeta.get(latestId) : null;
    const latestRecords = latestId ? this.uploads.get(latestId) : null;

    let totalRecords = 0;
    let validRecords = 0;
    let pendingRecords = 0;
    let routedRecords = 0;

    if (latestRecords) {
      totalRecords = latestRecords.length;
      validRecords = latestRecords.filter(
        (r) => r.validationStatus === 'VALID'
      ).length;
      pendingRecords = latestRecords.filter(
        (r) => r.executionStatus === 'PENDING'
      ).length;
      routedRecords = latestRecords.filter(
        (r) => r.executionStatus === 'ROUTED'
      ).length;
    }

    return {
      hasRecords: totalRecords > 0,
      totalRecords,
      validRecords,
      pendingRecords,
      routedRecords,
      lastUpload: latestId && latestMeta
        ? { uploadId: latestId, ...latestMeta }
        : null,
    };
  }

  /**
   * Clear all data (for testing / reset).
   */
  clear(): void {
    this.uploads.clear();
    this.uploadMeta.clear();
    this.uploadOrder = [];
    this.logger.log('Record store cleared');
  }
}
