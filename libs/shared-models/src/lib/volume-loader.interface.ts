/**
 * Dynamic Volume Loader Interfaces
 * Supports loading task data from various external sources (GCS, S3, SFTP, etc.)
 */

/**
 * Represents a configured volume loader
 */
export interface VolumeLoader {
  /** Unique identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of what this loader does */
  description?: string;

  /** Type of volume source */
  type: VolumeLoaderType;

  /** Whether the loader is enabled */
  enabled: boolean;

  /** Target pipeline ID - data flows into this pipeline's routing rules */
  pipelineId?: string;

  /** Connection/source configuration */
  config: VolumeLoaderConfig;

  /** Schedule configuration for periodic loading */
  schedule?: VolumeLoaderSchedule;

  /** Data format and parsing options */
  dataFormat: DataFormatConfig;

  /** Field mappings from source to task */
  fieldMappings: VolumeFieldMapping[];

  /** Default values for task fields */
  defaults?: VolumeTaskDefaults;

  /** Processing options */
  processingOptions: ProcessingOptions;

  /** Status of the loader */
  status: VolumeLoaderStatus;

  /** Statistics */
  stats: VolumeLoaderStats;

  /** When this loader was created */
  createdAt: string;

  /** When this loader was last updated */
  updatedAt: string;

  /** When this loader last ran */
  lastRunAt?: string;

  /** When this loader will next run */
  nextRunAt?: string;
}

/**
 * Types of volume loader sources
 */
export type VolumeLoaderType =
  | 'GCS'      // Google Cloud Storage
  | 'S3'       // Amazon S3
  | 'SFTP'     // SFTP server
  | 'HTTP'     // HTTP/REST endpoint
  | 'LOCAL';   // Local file system (for testing)

/**
 * Connection configuration based on loader type
 */
export type VolumeLoaderConfig =
  | GcsConfig
  | S3Config
  | SftpConfig
  | HttpConfig
  | LocalConfig;

/**
 * Google Cloud Storage configuration
 */
export interface GcsConfig {
  type: 'GCS';
  /** GCS bucket name */
  bucket: string;
  /** Path prefix within the bucket */
  pathPrefix?: string;
  /** File pattern to match (glob) */
  filePattern: string;
  /** Service account credentials (JSON) */
  credentials?: string;
  /** Project ID */
  projectId?: string;
}

/**
 * Amazon S3 configuration
 */
export interface S3Config {
  type: 'S3';
  /** S3 bucket name */
  bucket: string;
  /** AWS region */
  region: string;
  /** Path prefix within the bucket */
  pathPrefix?: string;
  /** File pattern to match (glob) */
  filePattern: string;
  /** Access key ID */
  accessKeyId?: string;
  /** Secret access key */
  secretAccessKey?: string;
}

/**
 * SFTP configuration
 */
export interface SftpConfig {
  type: 'SFTP';
  /** SFTP host */
  host: string;
  /** SFTP port */
  port: number;
  /** Username */
  username: string;
  /** Password or private key */
  password?: string;
  /** Private key content */
  privateKey?: string;
  /** Remote directory path */
  remotePath: string;
  /** File pattern to match (glob) */
  filePattern: string;
}

/**
 * HTTP/REST endpoint configuration
 */
export interface HttpConfig {
  type: 'HTTP';
  /** Base URL */
  url: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body template (for POST) */
  bodyTemplate?: string;
  /** Authentication type */
  authType?: 'none' | 'basic' | 'bearer' | 'api_key';
  /** Auth credentials */
  authCredentials?: string;
  /** Pagination configuration */
  pagination?: PaginationConfig;
}

/**
 * Local file system configuration (for testing and direct CSV upload)
 */
export interface LocalConfig {
  type: 'LOCAL';
  /** Directory path to watch/read from */
  directory: string;
  /** File pattern to match (glob), e.g., "*.csv" */
  filePattern: string;
  /** Optional directory to move processed files to */
  archiveDirectory?: string;
}

/**
 * Pagination configuration for HTTP sources
 */
export interface PaginationConfig {
  /** Pagination type */
  type: 'offset' | 'cursor' | 'page';
  /** Parameter name for pagination */
  paramName: string;
  /** Page size */
  pageSize: number;
  /** Max pages to fetch (0 = unlimited) */
  maxPages: number;
  /** Path to next cursor in response */
  cursorPath?: string;
  /** Path to check if more data exists */
  hasMorePath?: string;
}

/**
 * Schedule configuration for periodic loading
 */
export interface VolumeLoaderSchedule {
  /** Whether scheduling is enabled */
  enabled: boolean;
  /** Schedule type */
  type: 'interval' | 'cron';
  /** Interval in minutes (for interval type) */
  intervalMinutes?: number;
  /** Cron expression (for cron type) */
  cronExpression?: string;
  /** Timezone for cron */
  timezone?: string;
  /** Only run during specific hours */
  activeHours?: {
    start: number; // 0-23
    end: number;   // 0-23
  };
  /** Days of week to run (0=Sunday, 6=Saturday) */
  activeDays?: number[];
}

/**
 * Data format configuration
 */
export interface DataFormatConfig {
  /** File format */
  format: 'CSV' | 'JSON' | 'JSONL' | 'XML' | 'EXCEL';
  /** CSV-specific options */
  csvOptions?: CsvFormatOptions;
  /** JSON-specific options */
  jsonOptions?: JsonFormatOptions;
  /** Character encoding */
  encoding?: string;
}

/**
 * CSV format options
 */
export interface CsvFormatOptions {
  /** Delimiter character */
  delimiter: string;
  /** Quote character */
  quote: string;
  /** Escape character */
  escape: string;
  /** Whether first row is headers */
  hasHeader: boolean;
  /** Skip first N rows */
  skipRows: number;
  /** Column names if no header */
  columnNames?: string[];
}

/**
 * JSON format options
 */
export interface JsonFormatOptions {
  /** Path to data array in JSON */
  dataPath: string;
  /** Whether each line is a separate JSON object (JSONL) */
  linesFormat: boolean;
}

/**
 * Field mapping from source to task
 */
export interface VolumeFieldMapping {
  /** Field name/path in source data */
  sourceField: string;
  /** Target field on task */
  targetField: VolumeTaskField;
  /** Transformation to apply */
  transform?: FieldTransformConfig;
  /** Default value if source is empty */
  defaultValue?: string;
  /** Whether this field is required */
  required: boolean;
  /** Validation regex pattern */
  validationPattern?: string;
}

/**
 * Task fields that can be populated from volume data
 */
export type VolumeTaskField =
  | 'externalId'
  | 'workType'
  | 'title'
  | 'description'
  | 'priority'
  | 'queue'
  | 'queueId'
  | 'skills'
  | 'payloadUrl'
  | 'metadata';

/**
 * Field transformation configuration
 */
export interface FieldTransformConfig {
  /** Transformation type */
  type: FieldTransformType;
  /** Parameters for the transformation */
  params?: Record<string, unknown>;
}

/**
 * Available field transformations
 */
export type FieldTransformType =
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json_parse'
  | 'split'
  | 'join'
  | 'regex_extract'
  | 'regex_replace'
  | 'template'
  | 'lookup';

/**
 * Default values for task fields
 */
export interface VolumeTaskDefaults {
  workType?: string;
  priority?: number;
  /** @deprecated Use pipelineId on VolumeLoader instead */
  queue?: string;
  /** @deprecated Use pipelineId on VolumeLoader instead */
  queueId?: string;
  skills?: string[];
  payloadUrlTemplate?: string;
}

/**
 * Processing options
 */
export interface ProcessingOptions {
  /** Batch size for processing */
  batchSize: number;
  /** Whether to skip duplicates (by externalId) */
  skipDuplicates: boolean;
  /** How to handle duplicates */
  duplicateStrategy: 'skip' | 'update' | 'error';
  /** Max records to process per run (0 = unlimited) */
  maxRecords: number;
  /** Whether to archive processed files */
  archiveProcessed: boolean;
  /** Archive path (for file-based sources) */
  archivePath?: string;
  /** Whether to delete processed files */
  deleteProcessed: boolean;
  /** Error threshold percentage to stop processing */
  errorThreshold: number;
  /** Whether to continue on error */
  continueOnError: boolean;
}

/**
 * Volume loader status
 */
export type VolumeLoaderStatus =
  | 'IDLE'          // Not running
  | 'RUNNING'       // Currently executing
  | 'SCHEDULED'     // Waiting for next scheduled run
  | 'PAUSED'        // Manually paused
  | 'ERROR'         // Last run had errors
  | 'DISABLED';     // Administratively disabled

/**
 * Statistics for a volume loader
 */
export interface VolumeLoaderStats {
  /** Total runs executed */
  totalRuns: number;
  /** Total records processed across all runs */
  totalRecordsProcessed: number;
  /** Total records that failed across all runs */
  totalRecordsFailed: number;
  /** Total files processed (for file-based sources) */
  totalFilesProcessed: number;
  /** Average records per run */
  averageRecordsPerRun: number;
  /** Average processing time per run (ms) */
  averageProcessingTime: number;
  /** Last run duration (ms) */
  lastRunDuration?: number;
  /** Success rate percentage */
  successRate: number;
}

/**
 * Record of a volume loader execution
 */
export interface VolumeLoaderRun {
  /** Unique run identifier */
  id: string;
  /** Loader ID */
  loaderId: string;
  /** Run status */
  status: VolumeLoaderRunStatus;
  /** When the run started */
  startedAt: string;
  /** When the run completed */
  completedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Trigger type */
  trigger: 'manual' | 'scheduled' | 'api';
  /** User who triggered (for manual) */
  triggeredBy?: string;
  /** Files processed (for file-based sources) */
  filesProcessed: string[];
  /** Total records found */
  recordsFound: number;
  /** Records successfully processed */
  recordsProcessed: number;
  /** Records that failed */
  recordsFailed: number;
  /** Records skipped (duplicates, etc.) */
  recordsSkipped: number;
  /** Error message if failed */
  error?: string;
  /** Detailed error log */
  errorLog?: VolumeLoaderError[];
}

/**
 * Volume loader run status
 */
export type VolumeLoaderRunStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'     // Completed with some errors
  | 'FAILED'
  | 'CANCELLED';

/**
 * Error record for a volume loader run
 */
export interface VolumeLoaderError {
  /** Record/row identifier */
  recordId?: string;
  /** Row number in source */
  rowNumber?: number;
  /** File name (for file-based sources) */
  fileName?: string;
  /** Error message */
  message: string;
  /** Field that caused the error */
  field?: string;
  /** Raw value that caused the error */
  value?: string;
  /** When the error occurred */
  timestamp: string;
}

/**
 * Request to create a new volume loader
 */
export interface CreateVolumeLoaderRequest {
  name: string;
  description?: string;
  type: VolumeLoaderType;
  /** Target pipeline ID - data flows into this pipeline's routing rules */
  pipelineId?: string;
  config: VolumeLoaderConfig;
  schedule?: VolumeLoaderSchedule;
  dataFormat: DataFormatConfig;
  fieldMappings: VolumeFieldMapping[];
  defaults?: VolumeTaskDefaults;
  processingOptions: ProcessingOptions;
}

/**
 * Request to update a volume loader
 */
export interface UpdateVolumeLoaderRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  /** Target pipeline ID - data flows into this pipeline's routing rules */
  pipelineId?: string;
  config?: VolumeLoaderConfig;
  schedule?: VolumeLoaderSchedule;
  dataFormat?: DataFormatConfig;
  fieldMappings?: VolumeFieldMapping[];
  defaults?: VolumeTaskDefaults;
  processingOptions?: ProcessingOptions;
}

/**
 * Request to trigger a manual run
 */
export interface TriggerVolumeLoaderRequest {
  /** Optional file path to process (for file-based sources) */
  filePath?: string;
  /** Whether to process all files or just new ones */
  processAll?: boolean;
  /** Maximum records to process */
  maxRecords?: number;
  /** Run in dry-run mode (no actual processing) */
  dryRun?: boolean;
}

/**
 * Response from a volume loader test
 */
export interface VolumeLoaderTestResult {
  /** Whether connection was successful */
  connectionSuccess: boolean;
  /** Connection error if failed */
  connectionError?: string;
  /** Files found matching pattern */
  filesFound: string[];
  /** Sample data preview */
  sampleData?: Record<string, unknown>[];
  /** Detected/parsed headers */
  headers?: string[];
  /** Validation errors */
  validationErrors?: string[];
}

/**
 * Summary of volume loaders
 */
export interface VolumeLoaderSummary {
  /** Total loaders configured */
  totalLoaders: number;
  /** Active (enabled) loaders */
  activeLoaders: number;
  /** Loaders currently running */
  runningLoaders: number;
  /** Loaders with errors */
  errorLoaders: number;
  /** Total records loaded today */
  recordsLoadedToday: number;
  /** Total runs today */
  runsToday: number;
}

/**
 * Default processing options
 */
export const DEFAULT_PROCESSING_OPTIONS: ProcessingOptions = {
  batchSize: 100,
  skipDuplicates: true,
  duplicateStrategy: 'skip',
  maxRecords: 0,
  archiveProcessed: false,
  deleteProcessed: false,
  errorThreshold: 50,
  continueOnError: true,
};

/**
 * Default CSV format options
 */
export const DEFAULT_CSV_OPTIONS: CsvFormatOptions = {
  delimiter: ',',
  quote: '"',
  escape: '"',
  hasHeader: true,
  skipRows: 0,
};

/**
 * Default JSON format options
 */
export const DEFAULT_JSON_OPTIONS: JsonFormatOptions = {
  dataPath: '$',
  linesFormat: false,
};
