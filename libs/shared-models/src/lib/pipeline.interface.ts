/**
 * Pipeline Interfaces
 *
 * Pipelines are the top-level container for organizing work.
 * They represent business lines, departments, or distinct workflow processes.
 *
 * Architecture:
 * - Pipeline (Parent Container)
 *   ├── Queues (Child containers for work)
 *   ├── Routing Rules (Conditional logic for queue assignment)
 *   ├── Data Sources (Volume Loaders feed into pipelines)
 *   └── Access Control (Agent permissions at pipeline/queue level)
 */

// =============================================================================
// PIPELINE CORE
// =============================================================================

/**
 * Pipeline - Top-level workflow container
 *
 * Examples:
 * - "Business A" with queues: Client Support, Research, Transcribe
 * - "Business B" with queues: Priority Clients, Email, Audit
 */
export interface Pipeline {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description of this pipeline's purpose */
  description?: string;

  /** Whether the pipeline is active */
  enabled: boolean;

  /** Work types allowed in this pipeline */
  allowedWorkTypes: string[];

  /** Dynamic data schema for this pipeline (defined by sample file upload) */
  dataSchema?: PipelineDataSchema;

  /** Default settings for tasks in this pipeline */
  defaults: PipelineDefaults;

  /** SLA configuration */
  sla?: PipelineSLA;

  /** Routing rules for distributing work to queues */
  routingRules: RoutingRule[];

  /** Default routing behavior when no rules match */
  defaultRouting: DefaultRoutingConfig;

  /** Statistics */
  stats: PipelineStats;

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;
}

// =============================================================================
// PIPELINE DATA SCHEMA (Dynamic field definitions)
// =============================================================================

/**
 * Dynamic data schema for a pipeline
 *
 * Each pipeline defines its own field structure based on the data being loaded.
 * This eliminates the need for rigid, predefined field mappings.
 */
export interface PipelineDataSchema {
  /** All fields in this pipeline's data model */
  fields: PipelineFieldDefinition[];

  /** Which field serves as the unique identifier for tasks/records */
  primaryIdField: string;

  /** Sample data from initial schema detection (for preview) */
  sampleData?: Record<string, unknown>[];

  /** Total rows analyzed when detecting schema */
  sampleRowCount?: number;

  /** Source file that defined this schema */
  sourceFileName?: string;

  /** When schema was created/detected */
  createdAt: string;

  /** When schema was last updated */
  updatedAt: string;
}

/**
 * Definition of a single field in the pipeline's data schema
 */
export interface PipelineFieldDefinition {
  /** Field name (from source data) */
  name: string;

  /** Display label (user can customize) */
  label?: string;

  /** Detected or specified data type */
  type: PipelineFieldType;

  /** Whether this field is required (present in all rows) */
  required: boolean;

  /** Whether this is the primary ID field */
  isPrimaryId: boolean;

  /** Sample values from the source data (for reference) */
  sampleValues?: string[];

  /** User-provided description */
  description?: string;

  /** Order for display (0 = first) */
  displayOrder: number;

  /** Whether to include in task payload */
  includeInPayload: boolean;

  /** Whether this field is searchable/filterable */
  searchable: boolean;
}

/**
 * Data types for pipeline fields
 */
export type PipelineFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'email'
  | 'url'
  | 'phone'
  | 'currency'
  | 'array'
  | 'object';

/**
 * Default settings applied to tasks entering this pipeline
 */
export interface PipelineDefaults {
  /** Default priority if not specified (1-10) */
  priority: number;

  /** Default work type if not specified */
  workType?: string;

  /** Default reservation timeout in seconds */
  reservationTimeoutSeconds: number;

  /** Whether to auto-accept tasks (skip RESERVED state) */
  autoAccept: boolean;
}

/**
 * SLA configuration for the pipeline
 */
export interface PipelineSLA {
  /** Target handle time in seconds */
  targetHandleTime?: number;

  /** Maximum queue wait time in seconds */
  maxQueueWaitTime?: number;

  /** Target service level percentage (e.g., 80% within target time) */
  serviceLevelTarget?: number;

  /** Time window for service level calculation (seconds) */
  serviceLevelWindow?: number;
}

/**
 * Pipeline statistics
 */
export interface PipelineStats {
  /** Total tasks processed */
  totalTasksProcessed: number;

  /** Tasks currently in queues */
  tasksInQueue: number;

  /** Tasks currently being worked */
  tasksActive: number;

  /** Average handle time (seconds) */
  avgHandleTime: number;

  /** Average queue wait time (seconds) */
  avgQueueWaitTime: number;

  /** Current service level percentage */
  currentServiceLevel: number;

  /** Last updated timestamp */
  lastUpdated: string;
}

// =============================================================================
// QUEUE (Child of Pipeline)
// =============================================================================

/**
 * Queue - Child container within a Pipeline
 *
 * Queues hold tasks waiting to be worked by agents.
 * They belong to exactly one Pipeline.
 */
export interface PipelineQueue {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Parent pipeline ID */
  pipelineId: string;

  /** Whether the queue is active */
  enabled: boolean;

  /** Priority of this queue (lower = higher priority) */
  priority: number;

  /** Required skills to work tasks in this queue */
  requiredSkills?: string[];

  /** Preferred skills (bonus for routing, not required) */
  preferredSkills?: string[];

  /** Maximum tasks allowed in queue (0 = unlimited) */
  maxCapacity: number;

  /** Queue-specific SLA overrides */
  slaOverrides?: Partial<PipelineSLA>;

  /** Queue statistics */
  stats: PipelineQueueStats;

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;
}

/**
 * Queue statistics
 */
export interface PipelineQueueStats {
  /** Tasks currently waiting */
  tasksWaiting: number;

  /** Tasks currently being worked */
  tasksActive: number;

  /** Tasks completed today */
  tasksCompletedToday: number;

  /** Average wait time (seconds) */
  avgWaitTime: number;

  /** Average handle time (seconds) */
  avgHandleTime: number;

  /** Longest current wait (seconds) */
  longestWait: number;

  /** Agents currently available for this queue */
  availableAgents: number;

  /** Last updated timestamp */
  lastUpdated: string;
}

// =============================================================================
// ROUTING RULES
// =============================================================================

/**
 * Routing Rule - Conditional logic for queue assignment
 *
 * Rules are evaluated in order by priority.
 * First matching rule determines the target queue.
 */
export interface RoutingRule {
  /** Unique identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description */
  description?: string;

  /** Whether the rule is active */
  enabled: boolean;

  /** Priority/order of evaluation (lower = evaluated first) */
  priority: number;

  /** Conditions that must ALL be true for rule to match */
  conditions: RoutingCondition[];

  /** Condition matching logic */
  conditionLogic: 'AND' | 'OR';

  /** Target queue ID when rule matches */
  targetQueueId: string;

  /** Optional: Override priority when routing */
  priorityOverride?: number;

  /** Optional: Add skills requirement when routing */
  addSkills?: string[];

  /** Statistics */
  matchCount: number;
  lastMatchedAt?: string;
}

/**
 * Individual condition within a routing rule
 */
export interface RoutingCondition {
  /** Unique identifier */
  id: string;

  /**
   * Field to evaluate — references a field name from the pipeline's data schema.
   * Any field defined in the schema (via sample file detection or manual mapping) can be used.
   */
  field: string;

  /** Comparison operator */
  operator: RoutingOperator;

  /** Value(s) to compare against */
  value: string | number | string[] | number[];

  /** Whether to negate the condition */
  negate?: boolean;
}

/**
 * @deprecated Use schema field names directly as strings.
 * Kept for reference during migration — routing conditions now accept any field name.
 */
export type RoutingConditionField = string;

/**
 * Comparison operators for routing conditions
 */
export type RoutingOperator =
  | 'equals'           // Exact match
  | 'not_equals'       // Not equal
  | 'contains'         // String contains
  | 'starts_with'      // String starts with
  | 'ends_with'        // String ends with
  | 'matches'          // Regex match
  | 'in'               // Value is in list
  | 'not_in'           // Value is not in list
  | 'greater_than'     // Numeric comparison
  | 'less_than'        // Numeric comparison
  | 'greater_or_equal' // Numeric comparison
  | 'less_or_equal'    // Numeric comparison
  | 'between'          // Numeric range (inclusive)
  | 'exists'           // Field has a value
  | 'not_exists';      // Field is empty/null

/**
 * Default routing when no rules match
 */
export interface DefaultRoutingConfig {
  /** Behavior when no rules match */
  behavior: 'route_to_queue' | 'reject' | 'hold';

  /** Default queue ID (for 'route_to_queue' behavior) */
  defaultQueueId?: string;

  /** Hold timeout in seconds (for 'hold' behavior) */
  holdTimeoutSeconds?: number;

  /** Action after hold timeout */
  holdTimeoutAction?: 'route_to_default' | 'reject';
}

// =============================================================================
// AGENT ACCESS CONTROL
// =============================================================================

/**
 * Agent access configuration for pipelines and queues
 *
 * Access can be granted at:
 * - Pipeline level: Agent can work ALL queues in the pipeline
 * - Queue level: Agent can work specific queues only
 */
export interface AgentPipelineAccess {
  /** Agent ID */
  agentId: string;

  /** Pipeline ID */
  pipelineId: string;

  /** Access level */
  accessLevel: 'full' | 'partial';

  /** Specific queue IDs (only used when accessLevel is 'partial') */
  queueIds?: string[];

  /** Whether agent can be auto-routed to this pipeline */
  autoRoutingEnabled: boolean;

  /** Maximum concurrent tasks from this pipeline */
  maxConcurrentTasks?: number;

  /** Priority modifier for this agent in this pipeline */
  priorityModifier?: number;

  /** Assigned at timestamp */
  assignedAt: string;

  /** Assigned by (admin user ID) */
  assignedBy: string;
}

// =============================================================================
// API TYPES
// =============================================================================

/**
 * Request to create a new pipeline
 */
export interface CreatePipelineRequest {
  name: string;
  description?: string;
  allowedWorkTypes?: string[];
  defaults?: Partial<PipelineDefaults>;
  sla?: PipelineSLA;
  defaultRouting?: DefaultRoutingConfig;
}

/**
 * Request to update a pipeline
 */
export interface UpdatePipelineRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  allowedWorkTypes?: string[];
  defaults?: Partial<PipelineDefaults>;
  sla?: PipelineSLA;
  defaultRouting?: DefaultRoutingConfig;
}

/**
 * Request to create a queue
 */
export interface CreateQueueRequest {
  name: string;
  description?: string;
  pipelineId: string;
  priority?: number;
  requiredSkills?: string[];
  preferredSkills?: string[];
  maxCapacity?: number;
  slaOverrides?: Partial<PipelineSLA>;
}

/**
 * Request to update a queue
 */
export interface UpdateQueueRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  requiredSkills?: string[];
  preferredSkills?: string[];
  maxCapacity?: number;
  slaOverrides?: Partial<PipelineSLA>;
}

/**
 * Request to create a routing rule
 */
export interface CreateRoutingRuleRequest {
  pipelineId: string;
  name: string;
  description?: string;
  priority?: number;
  conditions: RoutingCondition[];
  conditionLogic?: 'AND' | 'OR';
  targetQueueId: string;
  priorityOverride?: number;
  addSkills?: string[];
}

/**
 * Request to update a routing rule
 */
export interface UpdateRoutingRuleRequest {
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  conditions?: RoutingCondition[];
  conditionLogic?: 'AND' | 'OR';
  targetQueueId?: string;
  priorityOverride?: number;
  addSkills?: string[];
}

/**
 * Pipeline summary for dashboard/list views
 */
export interface PipelineSummary {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  queueCount: number;
  activeQueueCount: number;
  totalTasksInQueue: number;
  totalTasksActive: number;
  agentCount: number;
  currentServiceLevel: number;
}

/**
 * Full pipeline with queues and rules (for detail view)
 */
export interface PipelineWithDetails extends Pipeline {
  queues: PipelineQueue[];
  agentAccess: AgentPipelineAccess[];
  dataSources: string[]; // Volume loader IDs
}

// =============================================================================
// CONSTANTS & DEFAULTS
// =============================================================================

export const DEFAULT_PIPELINE_DEFAULTS: PipelineDefaults = {
  priority: 5,
  reservationTimeoutSeconds: 30,
  autoAccept: false,
};

export const DEFAULT_PIPELINE_QUEUE_STATS: PipelineQueueStats = {
  tasksWaiting: 0,
  tasksActive: 0,
  tasksCompletedToday: 0,
  avgWaitTime: 0,
  avgHandleTime: 0,
  longestWait: 0,
  availableAgents: 0,
  lastUpdated: new Date().toISOString(),
};

export const DEFAULT_PIPELINE_STATS: PipelineStats = {
  totalTasksProcessed: 0,
  tasksInQueue: 0,
  tasksActive: 0,
  avgHandleTime: 0,
  avgQueueWaitTime: 0,
  currentServiceLevel: 100,
  lastUpdated: new Date().toISOString(),
};

export const ROUTING_OPERATORS_BY_TYPE: Record<string, RoutingOperator[]> = {
  string: ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'matches', 'in', 'not_in', 'exists', 'not_exists'],
  number: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'between', 'in', 'not_in', 'exists', 'not_exists'],
  integer: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'between', 'in', 'not_in', 'exists', 'not_exists'],
  boolean: ['equals', 'not_equals', 'exists', 'not_exists'],
  date: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'between', 'exists', 'not_exists'],
  datetime: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'between', 'exists', 'not_exists'],
  timestamp: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'between', 'exists', 'not_exists'],
  email: ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'in', 'not_in', 'exists', 'not_exists'],
  url: ['equals', 'not_equals', 'contains', 'starts_with', 'exists', 'not_exists'],
  phone: ['equals', 'not_equals', 'contains', 'starts_with', 'in', 'not_in', 'exists', 'not_exists'],
  currency: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'between', 'exists', 'not_exists'],
  array: ['contains', 'in', 'not_in', 'exists', 'not_exists'],
};

export const ROUTING_OPERATOR_LABELS: Record<RoutingOperator, string> = {
  equals: 'Equals',
  not_equals: 'Does not equal',
  contains: 'Contains',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  matches: 'Matches pattern',
  in: 'Is one of',
  not_in: 'Is not one of',
  greater_than: 'Greater than',
  less_than: 'Less than',
  greater_or_equal: 'Greater than or equal',
  less_or_equal: 'Less than or equal',
  between: 'Between',
  exists: 'Has a value',
  not_exists: 'Is empty',
};
