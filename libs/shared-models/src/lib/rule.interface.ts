/**
 * Logic Builder Rule System
 *
 * Allows power users to configure queue routing and priority rules
 * without code changes. Rules are evaluated against tasks to determine
 * routing, priority adjustments, and agent assignments.
 */

// =============================================================================
// CONDITIONS
// =============================================================================

/**
 * Operators for comparing values in conditions
 */
export type ConditionOperator =
  | 'equals'           // ==
  | 'not_equals'       // !=
  | 'greater_than'     // >
  | 'less_than'        // <
  | 'greater_or_equal' // >=
  | 'less_or_equal'    // <=
  | 'contains'         // string contains
  | 'not_contains'     // string does not contain
  | 'starts_with'      // string starts with
  | 'ends_with'        // string ends with
  | 'in'               // value in array
  | 'not_in'           // value not in array
  | 'is_empty'         // null, undefined, or empty string
  | 'is_not_empty'     // has value
  | 'matches_regex';   // regex pattern match

/**
 * Fields that can be used in conditions
 */
export type ConditionField =
  | 'workType'
  | 'priority'
  | 'queue'
  | 'status'
  | 'skills'
  | 'title'
  | 'description'
  | 'externalId'
  | 'metadata.*';      // Supports dot notation for metadata fields

/**
 * A single condition that evaluates a task field
 */
export interface RuleCondition {
  /** Unique identifier for this condition */
  id: string;

  /** The task field to evaluate */
  field: ConditionField | string;

  /** The comparison operator */
  operator: ConditionOperator;

  /** The value to compare against (not needed for is_empty/is_not_empty) */
  value?: string | number | boolean | string[];

  /** Whether this condition is case-sensitive (for string comparisons) */
  caseSensitive?: boolean;
}

/**
 * Logical operators for combining conditions
 */
export type LogicalOperator = 'AND' | 'OR';

/**
 * A group of conditions combined with a logical operator
 */
export interface ConditionGroup {
  /** Unique identifier for this group */
  id: string;

  /** How to combine conditions in this group */
  operator: LogicalOperator;

  /** The conditions in this group */
  conditions: RuleCondition[];

  /** Nested condition groups for complex logic */
  groups?: ConditionGroup[];
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Types of actions that can be performed when a rule matches
 */
export type RuleActionType =
  | 'set_priority'       // Change task priority
  | 'adjust_priority'    // Increase/decrease priority by amount
  | 'set_queue'          // Assign to specific queue
  | 'add_skill'          // Add required skill
  | 'remove_skill'       // Remove required skill
  | 'set_metadata'       // Set a metadata field
  | 'route_to_agent'     // Route to specific agent
  | 'exclude_agent'      // Exclude specific agent
  | 'set_timeout'        // Set reservation timeout
  | 'stop_processing';   // Stop evaluating further rules

/**
 * An action to perform when rule conditions are met
 */
export interface RuleAction {
  /** Unique identifier for this action */
  id: string;

  /** The type of action to perform */
  type: RuleActionType;

  /** The value for the action (type depends on action type) */
  value: string | number | boolean;

  /** For metadata actions, the field name */
  field?: string;
}

// =============================================================================
// RULES
// =============================================================================

/**
 * A complete rule combining conditions and actions
 */
export interface Rule {
  /** Unique identifier for this rule */
  id: string;

  /** Human-readable name for the rule */
  name: string;

  /** Optional description of what this rule does */
  description?: string;

  /** Whether this rule is currently active */
  enabled: boolean;

  /** Priority/order for rule evaluation (lower = evaluated first) */
  order: number;

  /** The conditions that must be met for this rule to apply */
  conditionGroup: ConditionGroup;

  /** The actions to perform when conditions are met */
  actions: RuleAction[];

  /** Metadata */
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// =============================================================================
// RULE SETS
// =============================================================================

/**
 * A collection of rules that work together
 */
export interface RuleSet {
  /** Unique identifier for this rule set */
  id: string;

  /** Human-readable name */
  name: string;

  /** Optional description */
  description?: string;

  /** Whether this rule set is active */
  enabled: boolean;

  /** The rules in this set, evaluated in order */
  rules: Rule[];

  /** Which queues/work types this rule set applies to (empty = all) */
  appliesTo?: {
    workTypes?: string[];
    queues?: string[];
  };

  /** Metadata */
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// =============================================================================
// RULE EVALUATION RESULT
// =============================================================================

/**
 * Result of evaluating a rule against a task
 */
export interface RuleEvaluationResult {
  /** The rule that was evaluated */
  ruleId: string;

  /** Whether the rule's conditions were met */
  matched: boolean;

  /** The actions that were applied (if matched) */
  appliedActions?: RuleAction[];

  /** Details about condition evaluation (for debugging) */
  conditionResults?: {
    conditionId: string;
    field: string;
    operator: string;
    expected: unknown;
    actual: unknown;
    result: boolean;
  }[];
}

/**
 * Result of evaluating a rule set against a task
 */
export interface RuleSetEvaluationResult {
  /** The rule set that was evaluated */
  ruleSetId: string;

  /** Results for each rule in the set */
  ruleResults: RuleEvaluationResult[];

  /** Total number of rules that matched */
  matchedCount: number;

  /** All actions that were applied */
  allAppliedActions: RuleAction[];

  /** Whether processing was stopped early */
  stoppedEarly: boolean;
}

// =============================================================================
// UI CONFIGURATION
// =============================================================================

/**
 * Configuration for a field in the rule builder UI
 */
export interface RuleFieldConfig {
  /** The field identifier */
  field: ConditionField | string;

  /** Display label */
  label: string;

  /** Field description/help text */
  description?: string;

  /** Data type for value input */
  valueType: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';

  /** Available options (for select/multiselect) */
  options?: { value: string; label: string }[];

  /** Available operators for this field */
  operators: ConditionOperator[];
}

/**
 * Configuration for an action in the rule builder UI
 */
export interface RuleActionConfig {
  /** The action type */
  type: RuleActionType;

  /** Display label */
  label: string;

  /** Action description/help text */
  description?: string;

  /** Data type for value input */
  valueType: 'string' | 'number' | 'boolean' | 'select';

  /** Available options (for select) */
  options?: { value: string; label: string }[];

  /** Whether this action requires a field name */
  requiresField?: boolean;
}
