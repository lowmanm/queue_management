import { Injectable, Logger } from '@nestjs/common';
import {
  Task,
  Rule,
  RuleSet,
  RuleCondition,
  ConditionGroup,
  RuleAction,
  RuleEvaluationResult,
  RuleSetEvaluationResult,
  ConditionOperator,
} from '@nexus-queue/shared-models';

/**
 * Service for evaluating rules against tasks.
 * Implements the core logic for the Logic Builder feature.
 */
@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  // In-memory storage for rule sets (would be database in production)
  private ruleSets: Map<string, RuleSet> = new Map();

  constructor() {
    // Initialize with default rule set
    this.initializeDefaultRules();
  }

  /**
   * Initialize default rules for demonstration
   */
  private initializeDefaultRules(): void {
    const defaultRuleSet: RuleSet = {
      id: 'default',
      name: 'Default Priority Rules',
      description: 'Standard routing and priority rules',
      enabled: true,
      rules: [
        {
          id: 'high-priority-orders',
          name: 'High Priority Orders',
          description: 'Boost priority for urgent orders',
          enabled: true,
          order: 1,
          conditionGroup: {
            id: 'cg1',
            operator: 'AND',
            conditions: [
              {
                id: 'c1',
                field: 'workType',
                operator: 'equals',
                value: 'ORDERS',
              },
              {
                id: 'c2',
                field: 'priority',
                operator: 'less_or_equal',
                value: 3,
              },
            ],
          },
          actions: [
            {
              id: 'a1',
              type: 'adjust_priority',
              value: -2, // Boost priority (lower number = higher priority)
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'claims-routing',
          name: 'Claims Queue Routing',
          description: 'Route claims to specialized queue',
          enabled: true,
          order: 2,
          conditionGroup: {
            id: 'cg2',
            operator: 'AND',
            conditions: [
              {
                id: 'c3',
                field: 'workType',
                operator: 'equals',
                value: 'CLAIMS',
              },
            ],
          },
          actions: [
            {
              id: 'a2',
              type: 'set_queue',
              value: 'claims-specialists',
            },
            {
              id: 'a3',
              type: 'add_skill',
              value: 'claims-handling',
            },
          ],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.ruleSets.set(defaultRuleSet.id, defaultRuleSet);
    this.logger.log('Default rules initialized');
  }

  // ==========================================================================
  // RULE SET MANAGEMENT
  // ==========================================================================

  /**
   * Get all rule sets
   */
  getAllRuleSets(): RuleSet[] {
    return Array.from(this.ruleSets.values());
  }

  /**
   * Get a rule set by ID
   */
  getRuleSet(id: string): RuleSet | undefined {
    return this.ruleSets.get(id);
  }

  /**
   * Create or update a rule set
   */
  saveRuleSet(ruleSet: RuleSet): RuleSet {
    const now = new Date().toISOString();
    const existing = this.ruleSets.get(ruleSet.id);

    const updated: RuleSet = {
      ...ruleSet,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.ruleSets.set(ruleSet.id, updated);
    this.logger.log(`Rule set saved: ${ruleSet.id} (${ruleSet.name})`);
    return updated;
  }

  /**
   * Delete a rule set
   */
  deleteRuleSet(id: string): boolean {
    const deleted = this.ruleSets.delete(id);
    if (deleted) {
      this.logger.log(`Rule set deleted: ${id}`);
    }
    return deleted;
  }

  // ==========================================================================
  // RULE EVALUATION
  // ==========================================================================

  /**
   * Evaluate all applicable rule sets against a task
   */
  evaluateTask(task: Task): { task: Task; results: RuleSetEvaluationResult[] } {
    let modifiedTask = { ...task };
    const results: RuleSetEvaluationResult[] = [];

    for (const ruleSet of this.ruleSets.values()) {
      if (!ruleSet.enabled) continue;

      // Check if rule set applies to this task
      if (!this.ruleSetApplies(ruleSet, task)) continue;

      const result = this.evaluateRuleSet(ruleSet, modifiedTask);
      results.push(result);

      // Apply actions from matched rules
      modifiedTask = this.applyActions(modifiedTask, result.allAppliedActions);

      if (result.stoppedEarly) break;
    }

    return { task: modifiedTask, results };
  }

  /**
   * Check if a rule set applies to a task
   */
  private ruleSetApplies(ruleSet: RuleSet, task: Task): boolean {
    if (!ruleSet.appliesTo) return true;

    const { workTypes, queues } = ruleSet.appliesTo;

    if (workTypes?.length && !workTypes.includes(task.workType)) {
      return false;
    }

    if (queues?.length && task.queue && !queues.includes(task.queue)) {
      return false;
    }

    return true;
  }

  /**
   * Evaluate a single rule set against a task
   */
  evaluateRuleSet(ruleSet: RuleSet, task: Task): RuleSetEvaluationResult {
    const ruleResults: RuleEvaluationResult[] = [];
    const allAppliedActions: RuleAction[] = [];
    let stoppedEarly = false;

    // Sort rules by order
    const sortedRules = [...ruleSet.rules].sort((a, b) => a.order - b.order);

    for (const rule of sortedRules) {
      if (!rule.enabled) continue;

      const result = this.evaluateRule(rule, task);
      ruleResults.push(result);

      if (result.matched && result.appliedActions) {
        allAppliedActions.push(...result.appliedActions);

        // Check for stop_processing action
        if (result.appliedActions.some((a) => a.type === 'stop_processing')) {
          stoppedEarly = true;
          break;
        }
      }
    }

    return {
      ruleSetId: ruleSet.id,
      ruleResults,
      matchedCount: ruleResults.filter((r) => r.matched).length,
      allAppliedActions,
      stoppedEarly,
    };
  }

  /**
   * Evaluate a single rule against a task
   */
  evaluateRule(rule: Rule, task: Task): RuleEvaluationResult {
    const conditionResults: RuleEvaluationResult['conditionResults'] = [];

    const matched = this.evaluateConditionGroup(
      rule.conditionGroup,
      task,
      conditionResults
    );

    return {
      ruleId: rule.id,
      matched,
      appliedActions: matched ? rule.actions : undefined,
      conditionResults,
    };
  }

  /**
   * Evaluate a condition group (handles AND/OR logic)
   */
  private evaluateConditionGroup(
    group: ConditionGroup,
    task: Task,
    results: RuleEvaluationResult['conditionResults']
  ): boolean {
    const conditionOutcomes: boolean[] = [];

    // Evaluate individual conditions
    for (const condition of group.conditions) {
      const result = this.evaluateCondition(condition, task);
      conditionOutcomes.push(result.matched);

      results?.push({
        conditionId: condition.id,
        field: condition.field,
        operator: condition.operator,
        expected: condition.value,
        actual: result.actual,
        result: result.matched,
      });
    }

    // Evaluate nested groups
    if (group.groups) {
      for (const nestedGroup of group.groups) {
        const nestedResult = this.evaluateConditionGroup(
          nestedGroup,
          task,
          results
        );
        conditionOutcomes.push(nestedResult);
      }
    }

    // Combine results based on operator
    if (group.operator === 'AND') {
      return conditionOutcomes.every((r) => r);
    } else {
      return conditionOutcomes.some((r) => r);
    }
  }

  /**
   * Evaluate a single condition against a task
   */
  private evaluateCondition(
    condition: RuleCondition,
    task: Task
  ): { matched: boolean; actual: unknown } {
    const actual = this.getFieldValue(task, condition.field);
    const expected = condition.value;
    const caseSensitive = condition.caseSensitive ?? false;

    const matched = this.compareValues(
      actual,
      expected,
      condition.operator,
      caseSensitive
    );

    return { matched, actual };
  }

  /**
   * Get a field value from a task (supports dot notation for metadata)
   */
  private getFieldValue(task: Task, field: string): unknown {
    if (field.startsWith('metadata.')) {
      const metadataKey = field.substring(9);
      return task.metadata?.[metadataKey];
    }

    // Cast through unknown to access dynamic field names
    return (task as unknown as Record<string, unknown>)[field];
  }

  /**
   * Compare two values using the specified operator
   */
  private compareValues(
    actual: unknown,
    expected: unknown,
    operator: ConditionOperator,
    caseSensitive: boolean
  ): boolean {
    // Normalize strings for case-insensitive comparison
    const normalize = (val: unknown): unknown => {
      if (!caseSensitive && typeof val === 'string') {
        return val.toLowerCase();
      }
      return val;
    };

    const actualNorm = normalize(actual);
    const expectedNorm = normalize(expected);

    switch (operator) {
      case 'equals':
        return actualNorm === expectedNorm;

      case 'not_equals':
        return actualNorm !== expectedNorm;

      case 'greater_than':
        return Number(actual) > Number(expected);

      case 'less_than':
        return Number(actual) < Number(expected);

      case 'greater_or_equal':
        return Number(actual) >= Number(expected);

      case 'less_or_equal':
        return Number(actual) <= Number(expected);

      case 'contains':
        return String(actualNorm).includes(String(expectedNorm));

      case 'not_contains':
        return !String(actualNorm).includes(String(expectedNorm));

      case 'starts_with':
        return String(actualNorm).startsWith(String(expectedNorm));

      case 'ends_with':
        return String(actualNorm).endsWith(String(expectedNorm));

      case 'in':
        if (Array.isArray(expected)) {
          return expected.map(normalize).includes(actualNorm);
        }
        return false;

      case 'not_in':
        if (Array.isArray(expected)) {
          return !expected.map(normalize).includes(actualNorm);
        }
        return true;

      case 'is_empty':
        return (
          actual === null ||
          actual === undefined ||
          actual === '' ||
          (Array.isArray(actual) && actual.length === 0)
        );

      case 'is_not_empty':
        return (
          actual !== null &&
          actual !== undefined &&
          actual !== '' &&
          !(Array.isArray(actual) && actual.length === 0)
        );

      case 'matches_regex':
        try {
          const regex = new RegExp(String(expected), caseSensitive ? '' : 'i');
          return regex.test(String(actual));
        } catch {
          return false;
        }

      default:
        return false;
    }
  }

  /**
   * Apply actions to modify a task
   */
  private applyActions(task: Task, actions: RuleAction[]): Task {
    let modified = { ...task };

    for (const action of actions) {
      switch (action.type) {
        case 'set_priority':
          modified.priority = Number(action.value);
          break;

        case 'adjust_priority':
          modified.priority = Math.max(
            0,
            Math.min(10, modified.priority + Number(action.value))
          );
          break;

        case 'set_queue':
          modified.queue = String(action.value);
          break;

        case 'add_skill':
          modified.skills = [...(modified.skills || []), String(action.value)];
          break;

        case 'remove_skill':
          modified.skills = (modified.skills || []).filter(
            (s) => s !== String(action.value)
          );
          break;

        case 'set_metadata':
          modified.metadata = {
            ...modified.metadata,
            [action.field || 'custom']: String(action.value),
          };
          break;

        case 'set_timeout':
          modified.reservationTimeout = Number(action.value);
          break;

        // route_to_agent, exclude_agent, stop_processing
        // are handled at higher level, not by task modification
      }
    }

    return modified;
  }
}
