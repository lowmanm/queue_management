/**
 * Represents a configuration for ingesting tasks from external sources.
 */
export interface TaskSource {
  /** Unique identifier for this source configuration */
  id: string;

  /** Human-readable name */
  name: string;

  /** Source type: CSV upload, API, GCS, etc. */
  type: TaskSourceType;

  /** Whether this source is currently active */
  enabled: boolean;

  /** URL template with placeholders for dynamic values */
  urlTemplate: string;

  /** Mapping of CSV/source columns to task fields */
  fieldMappings: FieldMapping[];

  /** Default values for task fields not in source */
  defaults?: TaskDefaults;

  /** When this configuration was created */
  createdAt: string;

  /** When this configuration was last updated */
  updatedAt: string;
}

/** Types of task sources */
export type TaskSourceType = 'CSV' | 'API' | 'GCS' | 'MANUAL';

/**
 * Maps a source field to a task field
 */
export interface FieldMapping {
  /** Column name or field path in the source data */
  sourceField: string;

  /** Target field on the Task object */
  targetField: TaskMappableField;

  /** Optional transformation to apply */
  transform?: FieldTransform;

  /** Whether this mapping is required */
  required?: boolean;
}

/** Fields that can be mapped from source data */
export type TaskMappableField =
  | 'externalId'
  | 'workType'
  | 'title'
  | 'description'
  | 'priority'
  | 'queue'
  | 'skills'
  | 'metadata';

/** Transformation options for field values */
export type FieldTransform =
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'number'
  | 'json'
  | 'split_comma';

/**
 * Default values for task fields
 */
export interface TaskDefaults {
  workType?: string;
  priority?: number;
  queue?: string;
  skills?: string[];
}

/**
 * Represents a pending order/task from CSV upload
 */
export interface PendingOrder {
  /** Row index from the CSV (for reference) */
  rowIndex: number;

  /** Raw data from the CSV row */
  rawData: Record<string, string>;

  /** Parsed and mapped task data */
  taskData?: Partial<TaskFromSource>;

  /** Processing status */
  status: PendingOrderStatus;

  /** Error message if processing failed */
  error?: string;

  /** When this order was imported */
  importedAt: string;

  /** When this order was assigned to an agent */
  assignedAt?: string;

  /** Agent ID if assigned */
  assignedAgentId?: string;
}

/** Status of a pending order in the queue */
export type PendingOrderStatus =
  | 'PENDING'     // Waiting to be assigned
  | 'ASSIGNED'    // Given to an agent
  | 'COMPLETED'   // Work finished
  | 'SKIPPED'     // Skipped/filtered out
  | 'ERROR';      // Failed to process

/**
 * Task data created from an external source
 */
export interface TaskFromSource {
  externalId: string;
  workType: string;
  title: string;
  description?: string;
  priority: number;
  queue?: string;
  skills?: string[];
  payloadUrl: string;
  metadata: Record<string, string>;
}

/**
 * Result of parsing a CSV file
 */
export interface CsvParseResult {
  /** Whether parsing was successful */
  success: boolean;

  /** Number of rows parsed */
  totalRows: number;

  /** Number of rows successfully processed */
  successRows: number;

  /** Number of rows with errors */
  errorRows: number;

  /** Detected column headers */
  headers: string[];

  /** Parsed pending orders */
  orders: PendingOrder[];

  /** Overall error message if parsing failed */
  error?: string;
}

/**
 * Configuration for URL template building
 */
export interface UrlTemplateConfig {
  /** The URL template with {placeholder} syntax */
  template: string;

  /** Available placeholders and their descriptions */
  placeholders: UrlPlaceholder[];

  /** Example URL for preview */
  exampleUrl?: string;
}

/**
 * Describes a placeholder in a URL template
 */
export interface UrlPlaceholder {
  /** Placeholder name (without braces) */
  name: string;

  /** Human-readable description */
  description: string;

  /** Source field this maps to */
  sourceField?: string;

  /** Example value for preview */
  exampleValue?: string;
}

/**
 * Statistics about the current task queue
 */
export interface TaskQueueStats {
  /** Total pending orders */
  totalPending: number;

  /** Orders assigned but not completed */
  totalAssigned: number;

  /** Orders completed */
  totalCompleted: number;

  /** Orders with errors */
  totalErrors: number;

  /** When the last CSV was uploaded */
  lastUploadAt?: string;

  /** Source configuration ID */
  sourceId?: string;
}
