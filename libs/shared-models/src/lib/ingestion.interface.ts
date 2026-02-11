/**
 * Interfaces for CSV ingestion, record storage, routing, and execution.
 *
 * Data Flow:
 * CSV Upload → Validation → RecordStore (in-memory) → Routing → Execution → Task Distribution
 */

// === Ingested Record ===

/** Validation status of an individual record */
export type RecordValidationStatus = 'VALID' | 'INVALID' | 'SKIPPED';

/** Execution status of a record during a run */
export type RecordExecutionStatus = 'PENDING' | 'ROUTED' | 'FILTERED' | 'FAILED';

/**
 * A single record ingested from a CSV upload.
 */
export interface IngestedRecord {
  /** Auto-generated ID */
  id: string;

  /** Which upload batch this belongs to */
  uploadId: string;

  /** Row number in the original CSV (1-based) */
  rowNumber: number;

  /** Raw key-value pairs from the CSV row */
  data: Record<string, string>;

  /** Validation result */
  validationStatus: RecordValidationStatus;

  /** Validation error messages (if INVALID) */
  validationErrors: string[];

  /** Execution status (set during Run) */
  executionStatus: RecordExecutionStatus;

  /** Work type resolved by routing rules */
  resolvedWorkType?: string;

  /** Priority resolved by routing rules */
  resolvedPriority?: number;

  /** Queue resolved by routing rules */
  resolvedQueue?: string;
}

// === Upload Result ===

/**
 * Response returned after a CSV upload completes.
 * Provides transparent per-stage feedback.
 */
export interface UploadResult {
  /** Unique ID for this upload batch */
  uploadId: string;

  /** Original file name */
  fileName: string;

  /** Total rows parsed from the CSV (excluding header) */
  totalRows: number;

  /** Rows that passed validation */
  validRows: number;

  /** Rows that failed validation */
  invalidRows: number;

  /** Rows skipped (empty rows, etc.) */
  skippedRows: number;

  /** Timestamp of the upload */
  uploadedAt: string;

  /** Human-readable status summary */
  message: string;

  /** Per-row validation errors (first 50 max) */
  errors: UploadRowError[];
}

/**
 * Describes a validation error on a specific CSV row.
 */
export interface UploadRowError {
  /** Row number in the original CSV (1-based) */
  row: number;

  /** Column that failed validation */
  field: string;

  /** Description of the error */
  message: string;
}

// === Execution Result ===

/**
 * Response returned after a "Run Now" execution completes.
 */
export interface ExecutionResult {
  /** Unique ID for this execution run */
  executionId: string;

  /** Upload batch that was executed */
  uploadId: string;

  /** Total records loaded from the store */
  totalRecords: number;

  /** Records that matched routing rules and were queued */
  routedRecords: number;

  /** Records filtered out by routing rules */
  filteredRecords: number;

  /** Records that failed during routing/execution */
  failedRecords: number;

  /** Timestamp of execution start */
  startedAt: string;

  /** Timestamp of execution completion */
  completedAt: string;

  /** Duration in milliseconds */
  durationMs: number;

  /** Human-readable status summary */
  message: string;

  /** Breakdown by work type */
  routedByWorkType: Record<string, number>;

  /** Per-record failures (first 50 max) */
  failures: ExecutionFailure[];
}

/**
 * Describes a failure for a specific record during execution.
 */
export interface ExecutionFailure {
  /** Record ID */
  recordId: string;

  /** Row number in the original CSV */
  row: number;

  /** Reason for failure */
  reason: string;
}

// === Routing Rule ===

/**
 * A rule that maps CSV data to task properties.
 */
export interface RoutingRule {
  /** Unique rule ID */
  id: string;

  /** Human-readable rule name */
  name: string;

  /** Field in the CSV record to evaluate */
  field: string;

  /** Match operator */
  operator: 'equals' | 'contains' | 'startsWith' | 'regex';

  /** Value to match against */
  value: string;

  /** Work type to assign when matched */
  workType: string;

  /** Priority to assign (0-10, lower = higher) */
  priority: number;

  /** Queue to assign */
  queue: string;

  /** Skills required for this work type */
  skills: string[];

  /** Payload URL template (can use {{field}} placeholders) */
  payloadUrlTemplate: string;
}

// === Record Store State (for frontend) ===

/**
 * Summary of the current in-memory record store state.
 */
export interface RecordStoreState {
  /** Whether any records are loaded */
  hasRecords: boolean;

  /** Total records in the store */
  totalRecords: number;

  /** Records by validation status */
  validRecords: number;

  /** Records by execution status */
  pendingRecords: number;

  /** Records that have been routed */
  routedRecords: number;

  /** Most recent upload info */
  lastUpload: {
    uploadId: string;
    fileName: string;
    uploadedAt: string;
    totalRows: number;
  } | null;
}
