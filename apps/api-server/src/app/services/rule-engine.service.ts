import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Task,
  Rule,
  RuleSet,
  RuleCondition,
  ConditionGroup,
  RuleAction,
  RuleEvaluationResult,
  RuleSetEvaluationResult,
  RuleSetTestRequest,
  RuleSetTestResponse,
  ConditionOperator,
} from '@nexus-queue/shared-models';
import { RuleSetEntity } from '../entities';

/**
 * Service for evaluating rules against tasks.
 * Implements the core logic for the Logic Builder feature.
 */
@Injectable()
export class RuleEngineService implements OnModuleInit {
  private readonly logger = new Logger(RuleEngineService.name);

  /** In-memory cache; loaded from DB on init */
  private ruleSets: Map<string, RuleSet> = new Map();

  constructor(
    @InjectRepository(RuleSetEntity)
    private readonly ruleSetRepo: Repository<RuleSetEntity>
  ) {}

  async onModuleInit(): Promise<void> {
    const entities = await this.ruleSetRepo.find();
    if (entities.length > 0) {
      this.ruleSets.clear();
      for (const entity of entities) {
        this.ruleSets.set(entity.id, this.toModel(entity));
      }
      this.logger.log(`Loaded ${entities.length} rule sets from DB`);
    } else {
      this.logger.log('Rule engine service initialized (no rule sets in DB)');
    }
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
  async saveRuleSet(ruleSet: RuleSet): Promise<RuleSet> {
    const now = new Date().toISOString();
    const existing = this.ruleSets.get(ruleSet.id);

    const updated: RuleSet = {
      ...ruleSet,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const saved = await this.ruleSetRepo.save(this.toEntity(updated));
    const model = this.toModel(saved);
    this.ruleSets.set(model.id, model);
    this.logger.log(`Rule set saved: ${ruleSet.id} (${ruleSet.name})`);
    return model;
  }

  /**
   * Delete a rule set
   */
  async deleteRuleSet(id: string): Promise<boolean> {
    const exists = this.ruleSets.has(id);
    if (exists) {
      await this.ruleSetRepo.delete(id);
      this.ruleSets.delete(id);
      this.logger.log(`Rule set deleted: ${id}`);
    }
    return exists;
  }

  // === Private entity mapping ===

  private toEntity(ruleSet: RuleSet): RuleSetEntity {
    const entity = new RuleSetEntity();
    entity.id = ruleSet.id;
    entity.name = ruleSet.name;
    entity.description = ruleSet.description;
    entity.enabled = ruleSet.enabled ?? true;
    entity.pipelineId = ruleSet.appliesTo?.pipelineIds?.[0];
    entity.appliesTo = ruleSet.appliesTo as unknown as Record<string, unknown>;
    entity.rules = ruleSet.rules as unknown as Record<string, unknown>[];
    return entity;
  }

  private toModel(entity: RuleSetEntity): RuleSet {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      enabled: entity.enabled,
      appliesTo: entity.appliesTo as unknown as RuleSet['appliesTo'],
      rules: (entity.rules as unknown as Rule[]) || [],
      createdAt: entity.createdAt?.toISOString(),
      updatedAt: entity.updatedAt?.toISOString(),
    };
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
   * Test a rule set against sample task data without persisting anything.
   * Returns before/after task state plus per-rule evaluation details.
   */
  testRuleSet(ruleSetId: string, sampleTask: Record<string, unknown>): RuleSetTestResponse {
    const ruleSet = this.ruleSets.get(ruleSetId);

    // Build a minimal Task object from the sample data
    const taskBefore: Task = {
      id: 'test-task',
      externalId: (sampleTask['externalId'] as string) || 'test-external-id',
      workType: (sampleTask['workType'] as string) || 'TEST',
      title: (sampleTask['title'] as string) || 'Test Task',
      description: sampleTask['description'] as string | undefined,
      payloadUrl: (sampleTask['payloadUrl'] as string) || '',
      metadata: (sampleTask['metadata'] as Record<string, string>) || {},
      priority: (sampleTask['priority'] as number) ?? 5,
      skills: (sampleTask['skills'] as string[]) || [],
      queueId: sampleTask['queueId'] as string | undefined,
      queue: sampleTask['queue'] as string | undefined,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
      reservationTimeout: 60,
      actions: [],
    };

    // Merge any extra sample fields into metadata for field resolution
    for (const [key, value] of Object.entries(sampleTask)) {
      if (!['id', 'workType', 'title', 'description', 'payloadUrl', 'priority', 'skills', 'queue', 'queueId', 'status', 'createdAt', 'availableAt', 'reservationTimeout', 'actions', 'externalId', 'metadata'].includes(key)) {
        taskBefore.metadata = { ...taskBefore.metadata, [key]: String(value) };
      }
    }

    if (!ruleSet) {
      return {
        taskBefore: sampleTask,
        taskAfter: sampleTask,
        rulesEvaluated: [],
      };
    }

    const rulesEvaluated: RuleSetTestResponse['rulesEvaluated'] = [];
    let currentTask = { ...taskBefore };
    let stoppedAt: string | undefined;

    const sortedRules = [...ruleSet.rules].sort((a, b) => a.order - b.order);

    for (const rule of sortedRules) {
      if (!rule.enabled) continue;

      const result = this.evaluateRule(rule, currentTask);
      const actionsApplied: string[] = [];

      if (result.matched && result.appliedActions) {
        for (const action of result.appliedActions) {
          actionsApplied.push(`${action.type}${action.value !== undefined ? ': ' + String(action.value) : ''}`);
        }
        currentTask = this.applyActions(currentTask, result.appliedActions);

        if (result.appliedActions.some((a) => a.type === 'stop_processing')) {
          stoppedAt = rule.name;
          rulesEvaluated.push({ ruleId: rule.id, ruleName: rule.name, matched: true, actionsApplied });
          break;
        }
      }

      rulesEvaluated.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matched: result.matched,
        actionsApplied,
      });
    }

    // Build taskAfter as a plain Record
    const taskAfter: Record<string, unknown> = {
      ...sampleTask,
      priority: currentTask.priority,
      skills: currentTask.skills,
      queue: currentTask.queue,
      reservationTimeout: currentTask.reservationTimeout,
      metadata: currentTask.metadata,
    };

    return { taskBefore: sampleTask, taskAfter, rulesEvaluated, stoppedAt };
  }

  /**
   * Get all rule sets applicable to a specific pipeline.
   * Returns rule sets that either have no pipeline scope (global) or
   * explicitly include the given pipelineId in their appliesTo.pipelineIds.
   */
  getRuleSetsForPipeline(pipelineId: string): RuleSet[] {
    return Array.from(this.ruleSets.values()).filter((ruleSet) => {
      if (!ruleSet.enabled) return false;
      const ids = ruleSet.appliesTo?.pipelineIds;
      return !ids || ids.length === 0 || ids.includes(pipelineId);
    });
  }

  /**
   * Check if a rule set applies to a task
   */
  private ruleSetApplies(ruleSet: RuleSet, task: Task): boolean {
    if (!ruleSet.appliesTo) return true;

    const { pipelineIds, workTypes, queues } = ruleSet.appliesTo;

    // Filter by pipeline (from task metadata)
    if (pipelineIds?.length) {
      const taskPipelineId = task.metadata?.['_pipelineId'] as string | undefined;
      if (taskPipelineId && !pipelineIds.includes(taskPipelineId)) {
        return false;
      }
    }

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
  applyActions(task: Task, actions: RuleAction[]): Task {
    const modified = { ...task };

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
