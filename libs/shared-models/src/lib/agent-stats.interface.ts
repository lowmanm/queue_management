/**
 * Agent Statistics Interfaces
 *
 * Defines the statistics tracking for agents in the queue management system.
 * Tracks performance metrics like handle time, tasks completed, and productivity.
 */

/**
 * Real-time session statistics for an agent
 */
export interface AgentSessionStats {
  /** Agent ID */
  agentId: string;

  /** Session start time (login) */
  sessionStartedAt: string;

  /** Current agent state */
  currentState: AgentStateType;

  /** Time when current state started */
  stateStartedAt: string;

  /** Total tasks completed this session */
  tasksCompleted: number;

  /** Total tasks transferred this session */
  tasksTransferred: number;

  /** Total tasks rejected/timed out this session */
  tasksRejected: number;

  /** Total handle time in seconds (work + wrap-up) */
  totalHandleTime: number;

  /** Average handle time in seconds */
  averageHandleTime: number;

  /** Total wrap-up time in seconds */
  totalWrapUpTime: number;

  /** Average wrap-up time in seconds */
  averageWrapUpTime: number;

  /** Time spent in IDLE state in seconds */
  totalIdleTime: number;

  /** Time spent in ACTIVE state in seconds */
  totalActiveTime: number;

  /** Time spent paused/on break in seconds */
  totalPausedTime: number;

  /** Tasks per hour rate */
  tasksPerHour: number;

  /** Occupancy rate (active time / available time) */
  occupancyRate: number;

  /** Last activity timestamp */
  lastActivityAt: string;
}

/**
 * Agent state types for statistics tracking
 */
export type AgentStateType =
  | 'OFFLINE'
  | 'IDLE'
  | 'RESERVED'
  | 'ACTIVE'
  | 'WRAP_UP'
  | 'PAUSED'
  | 'BREAK'
  | 'LUNCH'
  | 'TRAINING'
  | 'MEETING';

/**
 * State change event for tracking time in each state
 */
export interface AgentStateChange {
  /** Agent ID */
  agentId: string;

  /** Previous state */
  fromState: AgentStateType;

  /** New state */
  toState: AgentStateType;

  /** Timestamp of state change */
  changedAt: string;

  /** Duration in previous state (seconds) */
  durationInPreviousState: number;

  /** Reason for state change (optional) */
  reason?: string;
}

/**
 * Task completion record for statistics
 */
export interface TaskCompletionRecord {
  /** Task ID */
  taskId: string;

  /** Agent ID who completed */
  agentId: string;

  /** Work type of the task */
  workType: string;

  /** Queue the task was from */
  queue?: string;

  /** Disposition code used */
  dispositionCode: string;

  /** Disposition category */
  dispositionCategory: string;

  /** Handle time in seconds (active work time) */
  handleTime: number;

  /** Wrap-up time in seconds */
  wrapUpTime: number;

  /** Total time from assignment to completion */
  totalTime: number;

  /** When task was assigned */
  assignedAt: string;

  /** When task work started */
  startedAt: string;

  /** When task work ended */
  completedAt: string;

  /** When disposition was submitted */
  dispositionedAt: string;
}

/**
 * Daily statistics summary for an agent
 */
export interface AgentDailyStats {
  /** Agent ID */
  agentId: string;

  /** Date for these stats */
  date: string;

  /** Login time */
  loginAt?: string;

  /** Logout time */
  logoutAt?: string;

  /** Total logged in time in seconds */
  totalLoggedInTime: number;

  /** Total productive time (active + wrap-up) */
  totalProductiveTime: number;

  /** Total idle time in seconds */
  totalIdleTime: number;

  /** Total paused/break time in seconds */
  totalPausedTime: number;

  /** Tasks completed */
  tasksCompleted: number;

  /** Tasks transferred */
  tasksTransferred: number;

  /** Tasks rejected/timed out */
  tasksRejected: number;

  /** Average handle time in seconds */
  averageHandleTime: number;

  /** Average wrap-up time in seconds */
  averageWrapUpTime: number;

  /** Tasks per hour */
  tasksPerHour: number;

  /** Occupancy rate (0-1) */
  occupancyRate: number;

  /** Utilization rate (productive time / logged in time) */
  utilizationRate: number;

  /** Breakdown by work type */
  workTypeBreakdown: WorkTypeStats[];

  /** Breakdown by disposition */
  dispositionBreakdown: AgentDispositionStats[];
}

/**
 * Statistics by work type
 */
export interface WorkTypeStats {
  /** Work type code */
  workType: string;

  /** Number of tasks */
  count: number;

  /** Average handle time for this work type */
  averageHandleTime: number;

  /** Percentage of total tasks */
  percentage: number;
}

/**
 * Statistics by disposition for agent stats
 */
export interface AgentDispositionStats {
  /** Disposition code */
  dispositionCode: string;

  /** Disposition name */
  dispositionName: string;

  /** Number of tasks with this disposition */
  count: number;

  /** Percentage of total tasks */
  percentage: number;
}

/**
 * Team/queue statistics for managers
 */
export interface TeamStats {
  /** Team ID */
  teamId: string;

  /** Team name */
  teamName: string;

  /** Number of agents in team */
  totalAgents: number;

  /** Agents currently online */
  onlineAgents: number;

  /** Agents currently working tasks */
  activeAgents: number;

  /** Agents available for tasks */
  availableAgents: number;

  /** Total tasks completed by team today */
  tasksCompletedToday: number;

  /** Average handle time across team */
  teamAverageHandleTime: number;

  /** Team tasks per hour */
  teamTasksPerHour: number;

  /** Individual agent stats */
  agentStats: AgentSessionStats[];
}

/**
 * Queue statistics for managers
 */
export interface QueueStats {
  /** Queue ID */
  queueId: string;

  /** Queue name */
  queueName: string;

  /** Current tasks in queue */
  tasksInQueue: number;

  /** Tasks waiting for assignment */
  tasksWaiting: number;

  /** Tasks currently being worked */
  tasksInProgress: number;

  /** Oldest task age in seconds */
  oldestTaskAge: number;

  /** Average wait time in seconds */
  averageWaitTime: number;

  /** Tasks completed today */
  tasksCompletedToday: number;

  /** Service level (tasks handled within SLA) */
  serviceLevelPercent: number;

  /** SLA target in seconds */
  slaTarget: number;
}

/**
 * Pause reason codes
 */
export type PauseReason =
  | 'BREAK'
  | 'LUNCH'
  | 'TRAINING'
  | 'MEETING'
  | 'COACHING'
  | 'TECHNICAL_ISSUE'
  | 'PERSONAL'
  | 'OTHER';

/**
 * Pause reason configuration
 */
export interface PauseReasonConfig {
  /** Reason code */
  code: PauseReason;

  /** Display label */
  label: string;

  /** Whether this is paid time */
  isPaid: boolean;

  /** Max allowed duration in minutes (0 = unlimited) */
  maxDuration: number;

  /** Whether requires approval */
  requiresApproval: boolean;
}

/**
 * Default pause reasons
 */
export const DEFAULT_PAUSE_REASONS: PauseReasonConfig[] = [
  {
    code: 'BREAK',
    label: 'Break',
    isPaid: true,
    maxDuration: 15,
    requiresApproval: false,
  },
  {
    code: 'LUNCH',
    label: 'Lunch',
    isPaid: false,
    maxDuration: 60,
    requiresApproval: false,
  },
  {
    code: 'TRAINING',
    label: 'Training',
    isPaid: true,
    maxDuration: 0,
    requiresApproval: true,
  },
  {
    code: 'MEETING',
    label: 'Meeting',
    isPaid: true,
    maxDuration: 0,
    requiresApproval: true,
  },
  {
    code: 'COACHING',
    label: 'Coaching',
    isPaid: true,
    maxDuration: 30,
    requiresApproval: false,
  },
  {
    code: 'TECHNICAL_ISSUE',
    label: 'Technical Issue',
    isPaid: true,
    maxDuration: 0,
    requiresApproval: false,
  },
  {
    code: 'PERSONAL',
    label: 'Personal',
    isPaid: false,
    maxDuration: 10,
    requiresApproval: false,
  },
  {
    code: 'OTHER',
    label: 'Other',
    isPaid: false,
    maxDuration: 0,
    requiresApproval: true,
  },
];

/**
 * Helper to format seconds as HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Helper to format seconds as human-readable string
 */
export function formatDurationHuman(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${Math.floor(seconds)}s`;
}

/**
 * Helper to calculate tasks per hour
 */
export function calculateTasksPerHour(
  tasksCompleted: number,
  activeTimeSeconds: number
): number {
  if (activeTimeSeconds <= 0) return 0;
  const hours = activeTimeSeconds / 3600;
  return Math.round((tasksCompleted / hours) * 10) / 10;
}

/**
 * Helper to calculate occupancy rate
 */
export function calculateOccupancyRate(
  activeTimeSeconds: number,
  availableTimeSeconds: number
): number {
  if (availableTimeSeconds <= 0) return 0;
  return Math.round((activeTimeSeconds / availableTimeSeconds) * 100) / 100;
}
