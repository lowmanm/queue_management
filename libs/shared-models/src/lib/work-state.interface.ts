/**
 * Agent Work States & Session Management
 * Comprehensive tracking of agent activity, work states, and sessions
 */

/**
 * System work states - these are fixed and cannot be modified
 * They represent the core task workflow states
 */
export type SystemWorkState =
  | 'LOGGED_OUT'      // Not logged in
  | 'LOGGED_IN'       // Logged in but not ready
  | 'READY'           // Available for tasks (IDLE)
  | 'RESERVED'        // Task offered, awaiting acceptance
  | 'ACTIVE'          // Working on a task
  | 'WRAP_UP';        // Completing disposition

/**
 * All possible agent work states
 * Combines system states with custom unavailable state IDs
 */
export type AgentWorkState = SystemWorkState | string;

/**
 * Work state categories for grouping and reporting
 */
export type WorkStateCategory =
  | 'productive'      // Task-related work (ACTIVE, WRAP_UP)
  | 'available'       // Ready for tasks (READY)
  | 'unavailable'     // Logged in but not available (BREAK, LUNCH, etc.)
  | 'offline';        // Not logged in

/**
 * Work state configuration
 */
export interface WorkStateConfig {
  /** Unique identifier - system states use fixed IDs, custom states use generated IDs */
  id: string;
  /** Display name */
  name: string;
  /** State category */
  category: WorkStateCategory;
  /** Color for UI display (hex) */
  color: string;
  /** Icon name for display */
  icon: string;
  /** Whether agents can manually select this state */
  agentSelectable: boolean;
  /** Whether this state counts as productive time */
  isProductive: boolean;
  /** Whether this state is billable */
  isBillable: boolean;
  /** Maximum time allowed in this state (minutes, 0 = unlimited) */
  maxDurationMinutes: number;
  /** Whether to show warning before max duration */
  warnBeforeMax: boolean;
  /** Minutes before max to show warning */
  warnMinutesBefore: number;
  /** Whether manager approval is required */
  requiresApproval: boolean;
  /** Order for display in UI */
  displayOrder: number;
  /** Whether this state is active/enabled */
  active: boolean;
  /** Whether this is a system state (cannot be deleted/modified structurally) */
  isSystemState: boolean;
  /** Timestamp when created */
  createdAt?: string;
  /** Timestamp when last updated */
  updatedAt?: string;
}

/**
 * Request to create a new custom unavailable state
 */
export interface CreateWorkStateRequest {
  name: string;
  color: string;
  icon: string;
  agentSelectable: boolean;
  isBillable: boolean;
  maxDurationMinutes: number;
  warnBeforeMax: boolean;
  warnMinutesBefore: number;
  requiresApproval: boolean;
  displayOrder?: number;
}

/**
 * Request to update a custom unavailable state
 */
export interface UpdateWorkStateRequest {
  name?: string;
  color?: string;
  icon?: string;
  agentSelectable?: boolean;
  isBillable?: boolean;
  maxDurationMinutes?: number;
  warnBeforeMax?: boolean;
  warnMinutesBefore?: number;
  requiresApproval?: boolean;
  displayOrder?: number;
  active?: boolean;
}

/**
 * List of system state IDs that cannot be deleted or have their category changed
 */
export const SYSTEM_STATE_IDS: SystemWorkState[] = [
  'LOGGED_OUT',
  'LOGGED_IN',
  'READY',
  'RESERVED',
  'ACTIVE',
  'WRAP_UP',
];

/**
 * Check if a state ID is a system state
 */
export function isSystemState(stateId: string): boolean {
  return SYSTEM_STATE_IDS.includes(stateId as SystemWorkState);
}

/**
 * System work state configurations - these cannot be deleted
 */
export const SYSTEM_WORK_STATES: WorkStateConfig[] = [
  {
    id: 'LOGGED_OUT',
    name: 'Logged Out',
    category: 'offline',
    color: '#6b7280',
    icon: 'log-out',
    agentSelectable: false,
    isProductive: false,
    isBillable: false,
    maxDurationMinutes: 0,
    warnBeforeMax: false,
    warnMinutesBefore: 0,
    requiresApproval: false,
    displayOrder: 0,
    active: true,
    isSystemState: true,
  },
  {
    id: 'LOGGED_IN',
    name: 'Logged In',
    category: 'unavailable',
    color: '#f59e0b',
    icon: 'log-in',
    agentSelectable: false,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 5,
    warnBeforeMax: true,
    warnMinutesBefore: 1,
    requiresApproval: false,
    displayOrder: 1,
    active: true,
    isSystemState: true,
  },
  {
    id: 'READY',
    name: 'Ready',
    category: 'available',
    color: '#10b981',
    icon: 'check-circle',
    agentSelectable: true,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 0,
    warnBeforeMax: false,
    warnMinutesBefore: 0,
    requiresApproval: false,
    displayOrder: 2,
    active: true,
    isSystemState: true,
  },
  {
    id: 'RESERVED',
    name: 'Reserved',
    category: 'productive',
    color: '#8b5cf6',
    icon: 'clock',
    agentSelectable: false,
    isProductive: true,
    isBillable: true,
    maxDurationMinutes: 0,
    warnBeforeMax: false,
    warnMinutesBefore: 0,
    requiresApproval: false,
    displayOrder: 3,
    active: true,
    isSystemState: true,
  },
  {
    id: 'ACTIVE',
    name: 'Active',
    category: 'productive',
    color: '#3b82f6',
    icon: 'play',
    agentSelectable: false,
    isProductive: true,
    isBillable: true,
    maxDurationMinutes: 0,
    warnBeforeMax: false,
    warnMinutesBefore: 0,
    requiresApproval: false,
    displayOrder: 4,
    active: true,
    isSystemState: true,
  },
  {
    id: 'WRAP_UP',
    name: 'Wrap Up',
    category: 'productive',
    color: '#06b6d4',
    icon: 'edit',
    agentSelectable: false,
    isProductive: true,
    isBillable: true,
    maxDurationMinutes: 5,
    warnBeforeMax: true,
    warnMinutesBefore: 1,
    requiresApproval: false,
    displayOrder: 5,
    active: true,
    isSystemState: true,
  },
];

/**
 * Default custom unavailable states - these can be modified/deleted by admins
 */
export const DEFAULT_CUSTOM_STATES: WorkStateConfig[] = [
  {
    id: 'BREAK',
    name: 'Break',
    category: 'unavailable',
    color: '#f97316',
    icon: 'coffee',
    agentSelectable: true,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 15,
    warnBeforeMax: true,
    warnMinutesBefore: 2,
    requiresApproval: false,
    displayOrder: 10,
    active: true,
    isSystemState: false,
  },
  {
    id: 'LUNCH',
    name: 'Lunch',
    category: 'unavailable',
    color: '#ef4444',
    icon: 'utensils',
    agentSelectable: true,
    isProductive: false,
    isBillable: false,
    maxDurationMinutes: 60,
    warnBeforeMax: true,
    warnMinutesBefore: 5,
    requiresApproval: false,
    displayOrder: 11,
    active: true,
    isSystemState: false,
  },
  {
    id: 'MEETING',
    name: 'Meeting',
    category: 'unavailable',
    color: '#a855f7',
    icon: 'users',
    agentSelectable: true,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 60,
    warnBeforeMax: true,
    warnMinutesBefore: 5,
    requiresApproval: true,
    displayOrder: 12,
    active: true,
    isSystemState: false,
  },
  {
    id: 'TRAINING',
    name: 'Training',
    category: 'unavailable',
    color: '#ec4899',
    icon: 'book-open',
    agentSelectable: true,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 120,
    warnBeforeMax: true,
    warnMinutesBefore: 10,
    requiresApproval: true,
    displayOrder: 13,
    active: true,
    isSystemState: false,
  },
  {
    id: 'COACHING',
    name: 'Coaching',
    category: 'unavailable',
    color: '#14b8a6',
    icon: 'message-circle',
    agentSelectable: false,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 30,
    warnBeforeMax: true,
    warnMinutesBefore: 5,
    requiresApproval: false,
    displayOrder: 14,
    active: true,
    isSystemState: false,
  },
  {
    id: 'PROJECT',
    name: 'Project Work',
    category: 'unavailable',
    color: '#6366f1',
    icon: 'folder',
    agentSelectable: true,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 0,
    warnBeforeMax: false,
    warnMinutesBefore: 0,
    requiresApproval: true,
    displayOrder: 15,
    active: true,
    isSystemState: false,
  },
  {
    id: 'TECHNICAL_ISSUE',
    name: 'Technical Issue',
    category: 'unavailable',
    color: '#dc2626',
    icon: 'alert-triangle',
    agentSelectable: true,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 30,
    warnBeforeMax: true,
    warnMinutesBefore: 5,
    requiresApproval: false,
    displayOrder: 16,
    active: true,
    isSystemState: false,
  },
  {
    id: 'SUPERVISOR',
    name: 'Supervisor Mode',
    category: 'unavailable',
    color: '#1d4ed8',
    icon: 'shield',
    agentSelectable: false,
    isProductive: false,
    isBillable: true,
    maxDurationMinutes: 0,
    warnBeforeMax: false,
    warnMinutesBefore: 0,
    requiresApproval: false,
    displayOrder: 17,
    active: true,
    isSystemState: false,
  },
];

/**
 * All default work states combined (for backwards compatibility)
 */
export const DEFAULT_WORK_STATES: WorkStateConfig[] = [
  ...SYSTEM_WORK_STATES,
  ...DEFAULT_CUSTOM_STATES,
];

/**
 * Agent session - tracks a single login session
 */
export interface AgentSession {
  /** Unique session ID */
  id: string;
  /** Agent/User ID */
  agentId: string;
  /** Agent display name */
  agentName: string;
  /** Team ID (if applicable) */
  teamId?: string;
  /** Current work state */
  currentState: AgentWorkState;
  /** When the session started (login time) */
  loginAt: string;
  /** When the session ended (logout time) */
  logoutAt?: string;
  /** Whether session is currently active */
  isActive: boolean;
  /** When state last changed */
  lastStateChangeAt: string;
  /** Current task ID (if working on task) */
  currentTaskId?: string;
  /** IP address of login */
  ipAddress?: string;
  /** User agent/browser info */
  userAgent?: string;
  /** Socket ID for WebSocket connection */
  socketId?: string;
  /** Session metadata */
  metadata?: Record<string, string>;
}

/**
 * State change event - records each state transition
 */
export interface StateChangeEvent {
  /** Unique event ID */
  id: string;
  /** Session ID this event belongs to */
  sessionId: string;
  /** Agent ID */
  agentId: string;
  /** Previous state */
  fromState: AgentWorkState;
  /** New state */
  toState: AgentWorkState;
  /** When the change occurred */
  timestamp: string;
  /** Duration in previous state (seconds) */
  durationInPreviousState: number;
  /** What triggered the change */
  trigger: StateChangeTrigger;
  /** Associated task ID (if applicable) */
  taskId?: string;
  /** Reason provided by agent (for manual state changes) */
  reason?: string;
  /** Whether this was manager approved */
  managerApproved?: boolean;
  /** Manager who approved (if applicable) */
  approvedBy?: string;
}

/**
 * Triggers for state changes
 */
export type StateChangeTrigger =
  | 'LOGIN'              // Agent logged in
  | 'LOGOUT'             // Agent logged out
  | 'AGENT_REQUEST'      // Agent requested state change
  | 'MANAGER_REQUEST'    // Manager changed agent state
  | 'TASK_ASSIGNED'      // System assigned task
  | 'TASK_ACCEPTED'      // Agent accepted task
  | 'TASK_REJECTED'      // Agent rejected task
  | 'TASK_COMPLETED'     // Agent completed task
  | 'TASK_TIMEOUT'       // Task reservation timeout
  | 'DISPOSITION_DONE'   // Wrap-up completed
  | 'SYSTEM_AUTO'        // System automatic change
  | 'TIMEOUT'            // State timeout (exceeded max duration)
  | 'DISCONNECT';        // WebSocket disconnection

/**
 * State change request from agent
 */
export interface StateChangeRequest {
  /** Requested state */
  requestedState: AgentWorkState;
  /** Reason for change */
  reason?: string;
  /** Expected duration (minutes, for break/meeting) */
  expectedDuration?: number;
}

/**
 * Agent session summary for dashboards
 */
export interface AgentSessionSummary {
  /** Agent ID */
  agentId: string;
  /** Agent name */
  agentName: string;
  /** Team ID */
  teamId?: string;
  /** Current state */
  currentState: AgentWorkState;
  /** Current state config */
  stateConfig: WorkStateConfig;
  /** Time in current state (seconds) */
  timeInCurrentState: number;
  /** Whether state duration exceeded max */
  isOverTime: boolean;
  /** Total logged in time today (seconds) */
  totalLoggedInTime: number;
  /** Total productive time today (seconds) */
  totalProductiveTime: number;
  /** Total available time today (seconds) */
  totalAvailableTime: number;
  /** Total unavailable time today (seconds) */
  totalUnavailableTime: number;
  /** Tasks completed today */
  tasksCompletedToday: number;
  /** Average handle time today (seconds) */
  avgHandleTimeToday: number;
  /** Utilization percentage (productive/logged in) */
  utilizationPercent: number;
}

/**
 * Team session summary
 */
export interface TeamSessionSummary {
  /** Team ID */
  teamId: string;
  /** Team name */
  teamName: string;
  /** Total agents */
  totalAgents: number;
  /** Currently logged in */
  loggedInAgents: number;
  /** Currently ready */
  readyAgents: number;
  /** Currently active (on task) */
  activeAgents: number;
  /** Currently unavailable (break, lunch, etc.) */
  unavailableAgents: number;
  /** State breakdown */
  stateBreakdown: Record<AgentWorkState, number>;
  /** Team utilization */
  teamUtilization: number;
}

/**
 * Helper to get work state config by ID from a list
 */
export function getWorkStateConfig(
  stateId: string,
  allStates: WorkStateConfig[] = DEFAULT_WORK_STATES
): WorkStateConfig | undefined {
  return allStates.find((s) => s.id === stateId);
}

/**
 * Helper to get selectable states for agents
 */
export function getAgentSelectableStates(
  allStates: WorkStateConfig[] = DEFAULT_WORK_STATES
): WorkStateConfig[] {
  return allStates.filter((s) => s.agentSelectable && s.active);
}

/**
 * Helper to check if state transition is valid
 * System state transitions are fixed, custom unavailable states can transition to/from READY
 */
export function isValidStateTransition(
  from: string,
  to: string,
  allStates: WorkStateConfig[] = DEFAULT_WORK_STATES
): boolean {
  // System state fixed transitions
  const systemTransitions: Record<string, string[]> = {
    LOGGED_OUT: ['LOGGED_IN'],
    LOGGED_IN: ['READY', 'LOGGED_OUT'],  // Can also go to any unavailable state
    READY: ['RESERVED', 'LOGGED_OUT'],    // Can also go to any unavailable state
    RESERVED: ['ACTIVE', 'READY', 'LOGGED_OUT'],
    ACTIVE: ['WRAP_UP', 'READY', 'LOGGED_OUT'],
    WRAP_UP: ['READY', 'LOGGED_OUT'],     // Can also go to any unavailable state
  };

  // Get all active unavailable state IDs
  const unavailableStateIds = allStates
    .filter((s) => s.category === 'unavailable' && s.active && s.id !== 'LOGGED_IN')
    .map((s) => s.id);

  // Check if 'from' is a system state
  if (systemTransitions[from]) {
    const allowedTargets = [...systemTransitions[from]];

    // LOGGED_IN, READY, and WRAP_UP can go to any unavailable state
    if (['LOGGED_IN', 'READY', 'WRAP_UP'].includes(from)) {
      allowedTargets.push(...unavailableStateIds);
    }

    return allowedTargets.includes(to);
  }

  // If 'from' is an unavailable state (custom or default), can go to READY or LOGGED_OUT
  // or to another unavailable state
  const fromState = allStates.find((s) => s.id === from);
  if (fromState?.category === 'unavailable') {
    return to === 'READY' || to === 'LOGGED_OUT' || unavailableStateIds.includes(to);
  }

  return false;
}

/**
 * Generate a unique ID for a new custom state
 */
export function generateWorkStateId(name: string): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_');
  const timestamp = Date.now().toString(36).slice(-4);
  return `${base}_${timestamp}`;
}

/**
 * Available icons for work states
 */
export const WORK_STATE_ICONS = [
  'coffee',
  'utensils',
  'users',
  'book-open',
  'message-circle',
  'folder',
  'alert-triangle',
  'shield',
  'clock',
  'phone',
  'headphones',
  'monitor',
  'tool',
  'heart',
  'star',
  'zap',
  'home',
  'car',
  'plane',
  'calendar',
  'briefcase',
  'clipboard',
  'file-text',
  'mail',
  'bell',
  'settings',
  'help-circle',
  'info',
  'pause-circle',
  'stop-circle',
] as const;
