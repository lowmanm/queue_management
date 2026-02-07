/**
 * Routing Configuration Interfaces
 * Defines skill-based routing, workload balancing, and agent matching
 */

/**
 * Skill definition with proficiency levels
 */
export interface Skill {
  /** Unique skill identifier */
  id: string;

  /** Display name */
  name: string;

  /** Description of the skill */
  description?: string;

  /** Category for grouping (e.g., 'language', 'product', 'technical') */
  category: SkillCategory;

  /** Whether this skill is active */
  active: boolean;

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;
}

export type SkillCategory =
  | 'language'
  | 'product'
  | 'technical'
  | 'process'
  | 'certification'
  | 'other';

/**
 * Agent skill assignment with proficiency
 */
export interface AgentSkill {
  /** Skill ID reference */
  skillId: string;

  /** Proficiency level (1-5) */
  proficiency: SkillProficiency;

  /** Whether this skill is currently active for this agent */
  active: boolean;

  /** When the skill was assigned */
  assignedAt: string;

  /** Last time proficiency was updated */
  updatedAt: string;
}

/** Skill proficiency levels */
export type SkillProficiency = 1 | 2 | 3 | 4 | 5;

export const PROFICIENCY_LABELS: Record<SkillProficiency, string> = {
  1: 'Novice',
  2: 'Basic',
  3: 'Intermediate',
  4: 'Advanced',
  5: 'Expert',
};

/**
 * Routing strategy configuration
 */
export interface RoutingStrategy {
  /** Unique identifier */
  id: string;

  /** Strategy name */
  name: string;

  /** Description */
  description?: string;

  /** Routing algorithm to use */
  algorithm: RoutingAlgorithm;

  /** Priority (lower = higher priority) */
  priority: number;

  /** Whether this strategy is active */
  active: boolean;

  /** Queue(s) this strategy applies to (empty = all) */
  queueIds: string[];

  /** Work type(s) this strategy applies to (empty = all) */
  workTypes: string[];

  /** Skill matching configuration */
  skillMatching: SkillMatchingConfig;

  /** Workload balancing configuration */
  workloadBalancing: WorkloadBalancingConfig;

  /** Fallback behavior when no match found */
  fallbackBehavior: FallbackBehavior;

  /** Created timestamp */
  createdAt: string;

  /** Updated timestamp */
  updatedAt: string;
}

/**
 * Routing algorithms
 */
export type RoutingAlgorithm =
  | 'round-robin'        // Simple rotation through agents
  | 'least-busy'         // Agent with fewest tasks/lowest utilization
  | 'most-idle'          // Agent idle the longest
  | 'skill-weighted'     // Best skill match with proficiency weighting
  | 'proficiency-first'  // Highest proficiency for required skills
  | 'load-balanced'      // Even distribution based on capacity
  | 'priority-cascade';  // Try high proficiency first, cascade down

/**
 * Skill matching configuration
 */
export interface SkillMatchingConfig {
  /** How to match skills */
  mode: SkillMatchMode;

  /** Minimum proficiency required (1-5) */
  minimumProficiency: SkillProficiency;

  /** Weight given to proficiency in scoring (0-100) */
  proficiencyWeight: number;

  /** Whether to require ALL skills or just ANY */
  requireAllSkills: boolean;

  /** Preferred skills (bonus points, not required) */
  preferredSkills: string[];

  /** Skills to exclude from matching */
  excludedSkills: string[];
}

export type SkillMatchMode =
  | 'strict'      // Agent must have all required skills at min proficiency
  | 'flexible'    // Agent needs majority of skills
  | 'any'         // Agent needs at least one skill
  | 'best-match'; // Score and rank all agents, pick best

/**
 * Workload balancing configuration
 */
export interface WorkloadBalancingConfig {
  /** Whether workload balancing is enabled */
  enabled: boolean;

  /** Maximum tasks per agent before considered overloaded */
  maxTasksPerAgent: number;

  /** Maximum concurrent tasks (hard limit) */
  maxConcurrentTasks: number;

  /** Weight for current task count in scoring (0-100) */
  taskCountWeight: number;

  /** Weight for average handle time in scoring (0-100) */
  handleTimeWeight: number;

  /** Weight for idle time in scoring (0-100) */
  idleTimeWeight: number;

  /** Consider agent's recent performance */
  considerPerformance: boolean;

  /** Time window for performance calculation (minutes) */
  performanceWindowMinutes: number;
}

/**
 * Fallback behavior when routing fails
 */
export interface FallbackBehavior {
  /** Action to take when no agent matches */
  action: FallbackAction;

  /** Queue to route to (for 'route_to_queue' action) */
  fallbackQueueId?: string;

  /** Time to wait before fallback (seconds) */
  waitTimeSeconds: number;

  /** Whether to relax skill requirements on fallback */
  relaxSkillRequirements: boolean;

  /** Minimum proficiency on fallback (can be lower than normal) */
  fallbackMinProficiency: SkillProficiency;
}

export type FallbackAction =
  | 'wait'            // Keep in queue, wait for available agent
  | 'route_to_queue'  // Route to fallback queue
  | 'escalate'        // Escalate to supervisor
  | 'any_available';  // Route to any available agent regardless of skills

/**
 * Agent routing score for matching
 */
export interface AgentRoutingScore {
  /** Agent ID */
  agentId: string;

  /** Agent name (for display) */
  agentName: string;

  /** Total score (0-100) */
  totalScore: number;

  /** Skill match score component */
  skillScore: number;

  /** Workload score component */
  workloadScore: number;

  /** Performance score component */
  performanceScore: number;

  /** Idle time score component */
  idleTimeScore: number;

  /** Skills matched */
  matchedSkills: string[];

  /** Skills missing */
  missingSkills: string[];

  /** Current task count */
  currentTaskCount: number;

  /** Time in current state (seconds) */
  timeInState: number;

  /** Whether agent is eligible for this task */
  eligible: boolean;

  /** Reason if not eligible */
  ineligibilityReason?: string;
}

/**
 * Routing decision result
 */
export interface RoutingDecision {
  /** Task ID being routed */
  taskId: string;

  /** Selected agent ID (null if no match) */
  selectedAgentId: string | null;

  /** Strategy that made the decision */
  strategyId: string;

  /** Strategy name */
  strategyName: string;

  /** Algorithm used */
  algorithm: RoutingAlgorithm;

  /** All agents scored */
  agentScores: AgentRoutingScore[];

  /** Decision timestamp */
  timestamp: string;

  /** Whether fallback was used */
  usedFallback: boolean;

  /** Fallback action taken (if applicable) */
  fallbackAction?: FallbackAction;

  /** Decision metadata */
  metadata: {
    totalAgentsEvaluated: number;
    eligibleAgents: number;
    evaluationTimeMs: number;
    requiredSkills: string[];
    preferredSkills: string[];
  };
}

/**
 * Agent capacity and status for workload balancing
 */
export interface AgentCapacity {
  /** Agent ID */
  agentId: string;

  /** Current state */
  state: string;

  /** Number of active tasks */
  activeTasks: number;

  /** Maximum tasks allowed */
  maxTasks: number;

  /** Utilization percentage (0-100) */
  utilization: number;

  /** Seconds since last state change */
  idleTime: number;

  /** Tasks completed today */
  tasksCompletedToday: number;

  /** Average handle time today (seconds) */
  avgHandleTimeToday: number;

  /** Is at capacity */
  atCapacity: boolean;

  /** Is available for new tasks */
  available: boolean;
}

/**
 * Routing configuration summary for display
 */
export interface RoutingConfigSummary {
  /** Total strategies defined */
  totalStrategies: number;

  /** Active strategies */
  activeStrategies: number;

  /** Total skills defined */
  totalSkills: number;

  /** Active skills */
  activeSkills: number;

  /** Default algorithm */
  defaultAlgorithm: RoutingAlgorithm;

  /** Workload balancing enabled globally */
  workloadBalancingEnabled: boolean;
}
