import { Injectable, Logger } from '@nestjs/common';
import {
  IngestedRecord,
  UploadResult,
  UploadRowError,
} from '@nexus-queue/shared-models';
import { RecordStoreService } from './record-store.service';

/** Required columns that every CSV must contain */
const REQUIRED_FIELDS = ['title', 'workType'];

@Injectable()
export class CsvIngestionService {
  private readonly logger = new Logger(CsvIngestionService.name);

  constructor(private readonly recordStore: RecordStoreService) {}

  /**
   * Parse raw CSV text, validate rows, and persist valid records to the store.
   *
   * Returns transparent feedback: exactly how many rows were parsed,
   * how many passed/failed validation, and per-row error details.
   */
  ingest(fileName: string, csvText: string): UploadResult {
    const uploadId = this.generateUploadId();
    const errors: UploadRowError[] = [];

    this.logger.log(`Starting ingestion for "${fileName}" (upload: ${uploadId})`);

    // --- Parse CSV ---
    const lines = csvText
      .split(/\r?\n/)
      .map((line) => line.trim());

    // Remove trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    if (lines.length < 2) {
      this.logger.warn(`Upload ${uploadId}: CSV has no data rows`);
      return {
        uploadId,
        fileName,
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        skippedRows: 0,
        uploadedAt: new Date().toISOString(),
        message: `Upload failed: CSV file "${fileName}" contains no data rows. A header row and at least one data row are required.`,
        errors: [],
      };
    }

    const headers = this.parseCsvLine(lines[0]).map((h) => h.trim());
    const dataLines = lines.slice(1);

    this.logger.log(`Parsed headers: [${headers.join(', ')}] | Data rows: ${dataLines.length}`);

    // --- Validate header contains required fields ---
    const missingHeaders = REQUIRED_FIELDS.filter(
      (f) => !headers.includes(f)
    );
    if (missingHeaders.length > 0) {
      this.logger.warn(`Upload ${uploadId}: Missing required columns: ${missingHeaders.join(', ')}`);
      return {
        uploadId,
        fileName,
        totalRows: dataLines.length,
        validRows: 0,
        invalidRows: dataLines.length,
        skippedRows: 0,
        uploadedAt: new Date().toISOString(),
        message: `Upload failed: CSV is missing required columns: ${missingHeaders.join(', ')}. Required columns are: ${REQUIRED_FIELDS.join(', ')}.`,
        errors: [],
      };
    }

    // --- Process each data row ---
    const records: IngestedRecord[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < dataLines.length; i++) {
      const rowNumber = i + 2; // 1-based, accounting for header
      const line = dataLines[i];

      // Skip empty lines
      if (line === '') {
        skippedCount++;
        continue;
      }

      const values = this.parseCsvLine(line);
      const data: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        data[headers[j]] = (values[j] || '').trim();
      }

      // Validate required fields
      const rowErrors: UploadRowError[] = [];
      for (const field of REQUIRED_FIELDS) {
        if (!data[field] || data[field] === '') {
          rowErrors.push({
            row: rowNumber,
            field,
            message: `Required field "${field}" is empty`,
          });
        }
      }

      const record: IngestedRecord = {
        id: `${uploadId}-R${rowNumber}`,
        uploadId,
        rowNumber,
        data,
        validationStatus: rowErrors.length > 0 ? 'INVALID' : 'VALID',
        validationErrors: rowErrors.map((e) => e.message),
        executionStatus: 'PENDING',
      };

      records.push(record);

      if (rowErrors.length > 0) {
        invalidCount++;
        if (errors.length < 50) {
          errors.push(...rowErrors);
        }
      } else {
        validCount++;
      }
    }

    // --- Persist to store ---
    this.recordStore.storeRecords(uploadId, fileName, records);

    const message = this.buildUploadMessage(
      fileName,
      dataLines.length,
      validCount,
      invalidCount,
      skippedCount
    );

    this.logger.log(`Upload ${uploadId} complete: ${validCount} valid, ${invalidCount} invalid, ${skippedCount} skipped`);

    return {
      uploadId,
      fileName,
      totalRows: dataLines.length,
      validRows: validCount,
      invalidRows: invalidCount,
      skippedRows: skippedCount,
      uploadedAt: new Date().toISOString(),
      message,
      errors,
    };
  }

  /**
   * Parse a single CSV line, handling quoted fields with commas.
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current);
    return result;
  }

  private buildUploadMessage(
    fileName: string,
    totalRows: number,
    valid: number,
    invalid: number,
    skipped: number
  ): string {
    const parts: string[] = [
      `Upload complete: "${fileName}" processed ${totalRows} rows.`,
    ];

    if (valid > 0) {
      parts.push(`${valid} rows stored in memory and ready for execution.`);
    }
    if (invalid > 0) {
      parts.push(`${invalid} rows failed validation.`);
    }
    if (skipped > 0) {
      parts.push(`${skipped} empty rows skipped.`);
    }
    if (valid === 0) {
      parts.push('No valid records available for execution.');
    }

    return parts.join(' ');
  }

  private generateUploadId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `UPL-${timestamp}-${random}`;
  }
}
