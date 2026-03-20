/**
 * Represents a task in the queue management system.
 */
export interface Task {
  // === Identity ===
  /** Unique identifier for the task */
  id: string;

  /** Reference ID from source system */
  externalId?: string;

  /** Category of work: "ORDERS", "RETURNS", "CLAIMS", etc. */
  workType: string;

  // === Content ===
  /** Human-readable title of the task */
  title: string;

  /** Optional description or notes */
  description?: string;

  /** URL to load in the iframe for task execution */
  payloadUrl: string;

  /**
   * How the external URL should be displayed in the workspace.
   * - 'iframe' — Embed directly (requires site to allow framing)
   * - 'popup' — Open in a managed popup window (for sites blocking iframes)
   * - 'auto' — Auto-detect embeddability (default)
   */
  displayMode?: 'iframe' | 'popup' | 'auto';

  /** Pass-through parameters for iFrame URL */
  metadata?: Record<string, string>;

  // === Priority & Routing ===
  /** Priority level (0-10, lower = higher priority) */
  priority: number;

  /** Required agent skills to work this task */
  skills?: string[];

  /** Queue ID for routing and disposition filtering */
  queueId?: string;

  /** Queue/team name assignment */
  queue?: string;

  // === Status ===
  /** Current status of the task */
  status: TaskStatus;

  // === Timestamps (ISO 8601) ===
  /** When task entered the system */
  createdAt: string;

  /** When task became workable (after filters applied) */
  availableAt?: string;

  /** When assigned to agent */
  reservedAt?: string;

  /** When agent accepted the task */
  acceptedAt?: string;

  /** When agent began working (iFrame loaded) */
  startedAt?: string;

  /** When agent finished working */
  completedAt?: string;

  /** When wrap-up/disposition completed */
  dispositionedAt?: string;

  // === Assignment ===
  /** Current or last assigned agent ID */
  assignedAgentId?: string;

  /** Full assignment history */
  assignmentHistory?: TaskAssignment[];

  // === Performance (Calculated - in seconds) ===
  /** Time spent working: startedAt → completedAt */
  handleTime?: number;

  /** Time to enter disposition: completedAt → dispositionedAt */
  wrapUpTime?: number;

  /** Full agent interaction time: reservedAt → dispositionedAt */
  totalTime?: number;

  /** Max seconds task can stay in RESERVED state before auto-release */
  reservationTimeout?: number;

  // === Cross-Pipeline Routing ===
  /**
   * Number of times this task has been transferred across pipelines.
   * Used to enforce MAX_PIPELINE_HOPS safety limit.
   * Defaults to 0 on initial ingestion.
   */
  pipelineHops?: number;

  // === Outcome ===
  /** Final disposition of the task */
  disposition?: TaskDisposition;

  // === Actions ===
  /** Dynamic buttons available for this task */
  actions?: TaskAction[];
}

/**
 * Tracks assignment history for a task
 */
export interface TaskAssignment {
  /** Agent who was assigned */
  agentId: string;

  /** When the assignment was made */
  assignedAt: string;

  /** When the assignment ended (if released) */
  releasedAt?: string;

  /** Reason for release */
  releaseReason?: TaskReleaseReason;
}

/**
 * Represents the final outcome/disposition of a task
 */
export interface TaskDisposition {
  /** Disposition code: "RESOLVED", "CALLBACK", "ESCALATE", etc. */
  code: string;

  /** Human-readable label */
  label: string;

  /** Optional notes from agent */
  notes?: string;

  /** When disposition was selected */
  selectedAt: string;

  /** Agent who selected the disposition */
  selectedBy: string;
}

/**
 * Configures a dynamic action button for a task
 */
export interface TaskAction {
  /** Unique identifier for the action */
  id: string;

  /** Button label */
  label: string;

  /** Type of action */
  type: TaskActionType;

  /** Optional icon identifier */
  icon?: string;

  /** URL to open (for LINK type) */
  url?: string;

  /** Disposition code to apply (for COMPLETE type) */
  dispositionCode?: string;

  /** Whether this is the primary action */
  primary?: boolean;
}

/** Possible status values for a task */
export type TaskStatus =
  | 'PENDING'      // In queue, not yet assigned
  | 'RESERVED'     // Assigned to agent, awaiting acceptance
  | 'ACTIVE'       // Agent actively working
  | 'WRAP_UP'      // Work done, entering disposition
  | 'COMPLETED'    // Fully closed
  | 'TRANSFERRED'  // Moved to another agent/queue
  | 'EXPIRED';     // Timed out without completion

/** Types of actions available on tasks */
export type TaskActionType = 'COMPLETE' | 'TRANSFER' | 'LINK' | 'CUSTOM';

/** Reasons a task assignment may be released */
export type TaskReleaseReason = 'COMPLETED' | 'TRANSFERRED' | 'TIMEOUT' | 'MANUAL';

// =============================================================================
// DEAD LETTER QUEUE
// =============================================================================

/**
 * Reason a task was moved to the dead-letter queue
 */
export type DLQReason = 'routing_failed' | 'sla_expired' | 'max_retries_exceeded';

/**
 * A task entry in the dead-letter queue
 */
export interface DLQEntry {
  /** The task's unique identifier */
  taskId: string;

  /** Full task payload */
  task: Task;

  /** Queue the task was last assigned to */
  queueId: string;

  /** Pipeline the task belongs to, if known */
  pipelineId?: string;

  /** Why the task was moved to the DLQ */
  reason: DLQReason;

  /** When the task was moved to the DLQ */
  movedAt: string;

  /** How many retry attempts have been made */
  retryCount: number;
}
