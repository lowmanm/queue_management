/**
 * Disposition System Interfaces
 *
 * Dispositions are wrap-up codes that agents select when completing a task.
 * They track the outcome of work and can trigger different workflows.
 */

/**
 * Categories of dispositions that determine task outcome behavior
 */
export type DispositionCategory =
  | 'COMPLETED'    // Task finished successfully
  | 'TRANSFERRED'  // Task moved to another queue/agent
  | 'ESCALATED'    // Task escalated to supervisor/specialist
  | 'DEFERRED'     // Task postponed for later handling
  | 'CANCELLED'    // Task cancelled/voided
  | 'ERROR';       // Task could not be completed due to error

/**
 * A disposition code that can be selected when completing a task
 */
export interface Disposition {
  /** Unique identifier */
  id: string;

  /** Short code for the disposition (e.g., "REQ_REL", "CANCEL") */
  code: string;

  /** Display name shown to agents */
  name: string;

  /** Detailed description of when to use this disposition */
  description?: string;

  /** Category determining task outcome behavior */
  category: DispositionCategory;

  /** Whether a note is required when selecting this disposition */
  requiresNote: boolean;

  /** Whether this disposition is currently active */
  active: boolean;

  /** Display order in the list */
  order: number;

  /** Icon name for UI display */
  icon?: string;

  /** Color theme for UI display */
  color?: DispositionColor;

  /** Queue IDs this disposition applies to (empty = all queues) */
  queueIds: string[];

  /** Work type IDs this disposition applies to (empty = all work types) */
  workTypeIds: string[];

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/**
 * Color options for disposition display
 */
export type DispositionColor =
  | 'green'   // Success/positive outcome
  | 'blue'    // Neutral/transfer
  | 'orange'  // Warning/deferred
  | 'red'     // Error/cancelled
  | 'purple'  // Escalation
  | 'gray';   // Default

/**
 * Request to create a new disposition
 */
export interface CreateDispositionRequest {
  code: string;
  name: string;
  description?: string;
  category: DispositionCategory;
  requiresNote?: boolean;
  order?: number;
  icon?: string;
  color?: DispositionColor;
  queueIds?: string[];
  workTypeIds?: string[];
}

/**
 * Request to update an existing disposition
 */
export interface UpdateDispositionRequest {
  code?: string;
  name?: string;
  description?: string;
  category?: DispositionCategory;
  requiresNote?: boolean;
  active?: boolean;
  order?: number;
  icon?: string;
  color?: DispositionColor;
  queueIds?: string[];
  workTypeIds?: string[];
}

/**
 * A queue definition for routing and disposition assignment
 */
export interface Queue {
  /** Unique identifier */
  id: string;

  /** Queue name */
  name: string;

  /** Queue description */
  description?: string;

  /** Whether queue is active */
  active: boolean;

  /** Default priority for items in this queue */
  defaultPriority: number;

  /** SLA target in seconds */
  slaTarget?: number;

  /** Skills required to work this queue */
  requiredSkills: string[];

  /** Work types allowed in this queue */
  workTypeIds: string[];

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/**
 * A work type definition
 */
export interface WorkType {
  /** Unique identifier */
  id: string;

  /** Work type code (e.g., "ORDERS", "RETURNS") */
  code: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Whether work type is active */
  active: boolean;

  /** Default handle time in seconds */
  defaultHandleTime: number;

  /** Color for UI display */
  color?: string;

  /** Icon for UI display */
  icon?: string;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/**
 * Record of a completed task with disposition
 */
export interface TaskCompletion {
  /** Unique identifier */
  id: string;

  /** Task ID that was completed */
  taskId: string;

  /** External ID from source system */
  externalId?: string;

  /** Agent who completed the task */
  agentId: string;

  /** Disposition selected */
  dispositionId: string;
  dispositionCode: string;
  dispositionCategory: DispositionCategory;

  /** Optional note from agent */
  note?: string;

  /** Work type of the task */
  workType: string;

  /** Queue the task was in */
  queue?: string;

  /** Handle time in seconds */
  handleTime: number;

  /** When task was assigned to agent */
  assignedAt: string;

  /** When task was completed */
  completedAt: string;

  /** Additional metadata */
  metadata?: Record<string, string>;
}

/**
 * Request to complete a task with disposition
 */
export interface CompleteTaskRequest {
  /** Task ID to complete */
  taskId: string;

  /** Disposition ID selected */
  dispositionId: string;

  /** Optional note */
  note?: string;
}

/**
 * Statistics for disposition usage
 */
export interface DispositionStats {
  /** Disposition ID */
  dispositionId: string;

  /** Disposition code */
  code: string;

  /** Disposition name */
  name: string;

  /** Count of times used */
  count: number;

  /** Percentage of total completions */
  percentage: number;
}

/**
 * Configuration for the disposition designer
 */
export interface DispositionConfig {
  /** All available dispositions */
  dispositions: Disposition[];

  /** All queues */
  queues: Queue[];

  /** All work types */
  workTypes: WorkType[];

  /** Category options with metadata */
  categories: DispositionCategoryConfig[];
}

/**
 * Configuration for a disposition category
 */
export interface DispositionCategoryConfig {
  /** Category value */
  value: DispositionCategory;

  /** Display label */
  label: string;

  /** Description of the category */
  description: string;

  /** Suggested color */
  suggestedColor: DispositionColor;

  /** Whether this category completes the task */
  completesTask: boolean;
}

/**
 * Default category configurations
 */
export const DISPOSITION_CATEGORIES: DispositionCategoryConfig[] = [
  {
    value: 'COMPLETED',
    label: 'Completed',
    description: 'Task finished successfully with desired outcome',
    suggestedColor: 'green',
    completesTask: true,
  },
  {
    value: 'TRANSFERRED',
    label: 'Transferred',
    description: 'Task moved to another queue or agent',
    suggestedColor: 'blue',
    completesTask: true,
  },
  {
    value: 'ESCALATED',
    label: 'Escalated',
    description: 'Task escalated to supervisor or specialist',
    suggestedColor: 'purple',
    completesTask: true,
  },
  {
    value: 'DEFERRED',
    label: 'Deferred',
    description: 'Task postponed for later handling',
    suggestedColor: 'orange',
    completesTask: false,
  },
  {
    value: 'CANCELLED',
    label: 'Cancelled',
    description: 'Task cancelled or voided',
    suggestedColor: 'gray',
    completesTask: true,
  },
  {
    value: 'ERROR',
    label: 'Error',
    description: 'Task could not be completed due to system error',
    suggestedColor: 'red',
    completesTask: true,
  },
];
