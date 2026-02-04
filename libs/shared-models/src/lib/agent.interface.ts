/**
 * Represents an agent in the queue management system.
 */
export interface Agent {
  /** Unique identifier for the agent */
  id: string;

  /** Display name */
  name: string;

  /** Email address */
  email?: string;

  /** Skills/competencies the agent possesses */
  skills: string[];

  /** Queues the agent is assigned to */
  queues?: string[];

  /** Current state in the state machine */
  state: AgentState;

  /** ID of the task currently being worked (if any) */
  currentTaskId?: string;

  // === Session Information ===
  /** When the agent's current session started */
  sessionStartedAt?: string;

  /** When the agent last changed state */
  lastStateChangeAt?: string;

  // === Session Metrics ===
  /** Number of tasks completed in current session */
  tasksCompleted: number;

  /** Rolling average handle time in seconds */
  avgHandleTime: number;

  /** Total handle time in current session (seconds) */
  totalHandleTime: number;

  /** Number of tasks transferred in current session */
  tasksTransferred: number;
}

/**
 * Agent state machine states
 *
 * State Flow:
 * IDLE → RESERVED → ACTIVE → WRAP_UP → IDLE
 *           ↓
 *         (timeout returns to IDLE)
 */
export type AgentState = 'IDLE' | 'RESERVED' | 'ACTIVE' | 'WRAP_UP' | 'OFFLINE';

/**
 * Event that triggers a state transition
 */
export interface AgentStateTransition {
  /** Previous state */
  fromState: AgentState;

  /** New state */
  toState: AgentState;

  /** When the transition occurred */
  timestamp: string;

  /** What triggered the transition */
  trigger: AgentStateTrigger;

  /** Related task ID (if applicable) */
  taskId?: string;
}

/** Triggers for agent state changes */
export type AgentStateTrigger =
  | 'TASK_ASSIGNED'    // System assigned a task → RESERVED
  | 'TASK_ACCEPTED'    // Agent accepted → ACTIVE
  | 'TASK_REJECTED'    // Agent rejected → IDLE
  | 'TASK_TIMEOUT'     // Reservation timed out → IDLE
  | 'TASK_COMPLETED'   // Agent finished work → WRAP_UP
  | 'DISPOSITION_DONE' // Wrap-up complete → IDLE
  | 'MANUAL_READY'     // Agent manually set ready → IDLE
  | 'MANUAL_OFFLINE'   // Agent went offline → OFFLINE
  | 'SESSION_START'    // Agent logged in → IDLE
  | 'SESSION_END';     // Agent logged out → OFFLINE

/**
 * Configuration for delivery mode (set by administrators)
 */
export interface DeliveryConfig {
  /** Delivery mode: FORCE pushes work, PULL requires agent action */
  mode: DeliveryMode;

  /** Seconds before reserved task auto-releases (FORCE mode) */
  reservationTimeoutSeconds: number;

  /** Whether to auto-accept in FORCE mode (skip RESERVED state) */
  autoAccept: boolean;

  /** Maximum concurrent tasks (usually 1 for back-office) */
  maxConcurrentTasks: number;
}

/** How tasks are delivered to agents */
export type DeliveryMode = 'FORCE' | 'PULL';
