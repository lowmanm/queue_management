import { Injectable, Logger } from '@nestjs/common';
import {
  Pipeline,
  PipelineQueue,
  RoutingRule,
  RoutingCondition,
  AgentPipelineAccess,
  PipelineSummary,
  PipelineWithDetails,
  CreatePipelineRequest,
  UpdatePipelineRequest,
  CreateQueueRequest,
  UpdateQueueRequest,
  CreateRoutingRuleRequest,
  UpdateRoutingRuleRequest,
  DEFAULT_PIPELINE_DEFAULTS,
  DEFAULT_PIPELINE_STATS,
  DEFAULT_PIPELINE_QUEUE_STATS,
  DefaultRoutingConfig,
  TaskFromSource,
} from '@nexus-queue/shared-models';

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  // In-memory storage
  private pipelines = new Map<string, Pipeline>();
  private queues = new Map<string, PipelineQueue>();
  private agentAccess = new Map<string, AgentPipelineAccess[]>(); // pipelineId -> access[]

  constructor() {
    this.initializeDefaultData();
  }

  /**
   * Initialize service - starts with empty state
   */
  private initializeDefaultData(): void {
    // No default pipelines - users create pipelines through the UI
    this.logger.log('Pipeline service initialized (no default pipelines)');
  }

  // ===========================================================================
  // PIPELINE CRUD
  // ===========================================================================

  getAllPipelines(): Pipeline[] {
    return Array.from(this.pipelines.values()).sort(
      (a, b) => a.name.localeCompare(b.name)
    );
  }

  getPipelineById(id: string): Pipeline | undefined {
    return this.pipelines.get(id);
  }

  getPipelineSummaries(): PipelineSummary[] {
    return this.getAllPipelines().map((pipeline) => {
      const queues = this.getQueuesByPipeline(pipeline.id);
      const activeQueues = queues.filter((q) => q.enabled);
      const access = this.agentAccess.get(pipeline.id) || [];

      return {
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        enabled: pipeline.enabled,
        queueCount: queues.length,
        activeQueueCount: activeQueues.length,
        totalTasksInQueue: queues.reduce((sum, q) => sum + q.stats.tasksWaiting, 0),
        totalTasksActive: queues.reduce((sum, q) => sum + q.stats.tasksActive, 0),
        agentCount: new Set(access.map((a) => a.agentId)).size,
        currentServiceLevel: pipeline.stats.currentServiceLevel,
      };
    });
  }

  getPipelineWithDetails(id: string): PipelineWithDetails | undefined {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) return undefined;

    return {
      ...pipeline,
      queues: this.getQueuesByPipeline(id),
      agentAccess: this.agentAccess.get(id) || [],
      dataSources: [], // TODO: Link volume loaders
    };
  }

  createPipeline(request: CreatePipelineRequest): {
    success: boolean;
    pipeline?: Pipeline;
    error?: string;
  } {
    // Validate name uniqueness
    const existing = this.getAllPipelines().find(
      (p) => p.name.toLowerCase() === request.name.toLowerCase()
    );
    if (existing) {
      return { success: false, error: `Pipeline "${request.name}" already exists` };
    }

    const now = new Date().toISOString();
    const pipeline: Pipeline = {
      id: this.generateId('pipeline'),
      name: request.name,
      description: request.description,
      enabled: true,
      allowedWorkTypes: request.allowedWorkTypes || [],
      defaults: {
        ...DEFAULT_PIPELINE_DEFAULTS,
        ...request.defaults,
      },
      sla: request.sla,
      routingRules: [],
      defaultRouting: {
        behavior: 'hold',
        holdTimeoutSeconds: 300,
        holdTimeoutAction: 'reject',
      },
      stats: { ...DEFAULT_PIPELINE_STATS },
      createdAt: now,
      updatedAt: now,
    };

    this.pipelines.set(pipeline.id, pipeline);
    this.logger.log(`Created pipeline: ${pipeline.name} (${pipeline.id})`);

    return { success: true, pipeline };
  }

  updatePipeline(
    id: string,
    request: UpdatePipelineRequest
  ): { success: boolean; pipeline?: Pipeline; error?: string } {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    // Validate name uniqueness if changing name
    if (request.name && request.name !== pipeline.name) {
      const existing = this.getAllPipelines().find(
        (p) => p.name.toLowerCase() === request.name!.toLowerCase() && p.id !== id
      );
      if (existing) {
        return { success: false, error: `Pipeline "${request.name}" already exists` };
      }
    }

    const updated: Pipeline = {
      ...pipeline,
      ...(request.name !== undefined && { name: request.name }),
      ...(request.description !== undefined && { description: request.description }),
      ...(request.enabled !== undefined && { enabled: request.enabled }),
      ...(request.allowedWorkTypes !== undefined && { allowedWorkTypes: request.allowedWorkTypes }),
      ...(request.defaults !== undefined && {
        defaults: { ...pipeline.defaults, ...request.defaults },
      }),
      ...(request.sla !== undefined && { sla: request.sla }),
      ...(request.defaultRouting !== undefined && { defaultRouting: request.defaultRouting }),
      updatedAt: new Date().toISOString(),
    };

    this.pipelines.set(id, updated);
    this.logger.log(`Updated pipeline: ${updated.name} (${id})`);

    return { success: true, pipeline: updated };
  }

  deletePipeline(id: string): { success: boolean; error?: string } {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    // Check for queues
    const queues = this.getQueuesByPipeline(id);
    if (queues.length > 0) {
      return {
        success: false,
        error: `Cannot delete pipeline with ${queues.length} queue(s). Delete queues first.`,
      };
    }

    this.pipelines.delete(id);
    this.agentAccess.delete(id);
    this.logger.log(`Deleted pipeline: ${pipeline.name} (${id})`);

    return { success: true };
  }

  // ===========================================================================
  // QUEUE CRUD
  // ===========================================================================

  getAllQueues(): PipelineQueue[] {
    return Array.from(this.queues.values()).sort((a, b) => {
      // Sort by pipeline, then by priority
      if (a.pipelineId !== b.pipelineId) {
        return a.pipelineId.localeCompare(b.pipelineId);
      }
      return a.priority - b.priority;
    });
  }

  getQueueById(id: string): PipelineQueue | undefined {
    return this.queues.get(id);
  }

  getQueuesByPipeline(pipelineId: string): PipelineQueue[] {
    return Array.from(this.queues.values())
      .filter((q) => q.pipelineId === pipelineId)
      .sort((a, b) => a.priority - b.priority);
  }

  createQueue(request: CreateQueueRequest): {
    success: boolean;
    queue?: PipelineQueue;
    error?: string;
  } {
    // Validate pipeline exists
    const pipeline = this.pipelines.get(request.pipelineId);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    // Validate name uniqueness within pipeline
    const existingQueues = this.getQueuesByPipeline(request.pipelineId);
    const existing = existingQueues.find(
      (q) => q.name.toLowerCase() === request.name.toLowerCase()
    );
    if (existing) {
      return {
        success: false,
        error: `Queue "${request.name}" already exists in this pipeline`,
      };
    }

    const now = new Date().toISOString();
    const queue: PipelineQueue = {
      id: this.generateId('queue'),
      name: request.name,
      description: request.description,
      pipelineId: request.pipelineId,
      enabled: true,
      priority: request.priority ?? existingQueues.length + 1,
      requiredSkills: request.requiredSkills,
      preferredSkills: request.preferredSkills,
      maxCapacity: request.maxCapacity ?? 0,
      slaOverrides: request.slaOverrides,
      stats: { ...DEFAULT_PIPELINE_QUEUE_STATS },
      createdAt: now,
      updatedAt: now,
    };

    this.queues.set(queue.id, queue);
    this.logger.log(`Created queue: ${queue.name} (${queue.id}) in pipeline ${pipeline.name}`);

    return { success: true, queue };
  }

  updateQueue(
    id: string,
    request: UpdateQueueRequest
  ): { success: boolean; queue?: PipelineQueue; error?: string } {
    const queue = this.queues.get(id);
    if (!queue) {
      return { success: false, error: 'Queue not found' };
    }

    // Validate name uniqueness if changing name
    if (request.name && request.name !== queue.name) {
      const existingQueues = this.getQueuesByPipeline(queue.pipelineId);
      const existing = existingQueues.find(
        (q) => q.name.toLowerCase() === request.name!.toLowerCase() && q.id !== id
      );
      if (existing) {
        return {
          success: false,
          error: `Queue "${request.name}" already exists in this pipeline`,
        };
      }
    }

    const updated: PipelineQueue = {
      ...queue,
      ...(request.name !== undefined && { name: request.name }),
      ...(request.description !== undefined && { description: request.description }),
      ...(request.enabled !== undefined && { enabled: request.enabled }),
      ...(request.priority !== undefined && { priority: request.priority }),
      ...(request.requiredSkills !== undefined && { requiredSkills: request.requiredSkills }),
      ...(request.preferredSkills !== undefined && { preferredSkills: request.preferredSkills }),
      ...(request.maxCapacity !== undefined && { maxCapacity: request.maxCapacity }),
      ...(request.slaOverrides !== undefined && { slaOverrides: request.slaOverrides }),
      updatedAt: new Date().toISOString(),
    };

    this.queues.set(id, updated);
    this.logger.log(`Updated queue: ${updated.name} (${id})`);

    return { success: true, queue: updated };
  }

  deleteQueue(id: string): { success: boolean; error?: string } {
    const queue = this.queues.get(id);
    if (!queue) {
      return { success: false, error: 'Queue not found' };
    }

    // Check if queue is used in routing rules
    const pipeline = this.pipelines.get(queue.pipelineId);
    if (pipeline) {
      const usedInRules = pipeline.routingRules.filter(
        (r) => r.targetQueueId === id
      );
      if (usedInRules.length > 0) {
        return {
          success: false,
          error: `Queue is used by ${usedInRules.length} routing rule(s). Update rules first.`,
        };
      }

      // Check if it's the default queue
      if (pipeline.defaultRouting?.defaultQueueId === id) {
        return {
          success: false,
          error: 'Queue is set as the default routing target. Update default routing first.',
        };
      }
    }

    this.queues.delete(id);
    this.logger.log(`Deleted queue: ${queue.name} (${id})`);

    return { success: true };
  }

  // ===========================================================================
  // ROUTING RULES
  // ===========================================================================

  getRoutingRules(pipelineId: string): RoutingRule[] {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return [];
    return [...pipeline.routingRules].sort((a, b) => a.priority - b.priority);
  }

  createRoutingRule(request: CreateRoutingRuleRequest): {
    success: boolean;
    rule?: RoutingRule;
    error?: string;
  } {
    const pipeline = this.pipelines.get(request.pipelineId);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    // Validate target queue exists and belongs to pipeline
    const targetQueue = this.queues.get(request.targetQueueId);
    if (!targetQueue) {
      return { success: false, error: 'Target queue not found' };
    }
    if (targetQueue.pipelineId !== request.pipelineId) {
      return { success: false, error: 'Target queue must belong to the same pipeline' };
    }

    const rule: RoutingRule = {
      id: this.generateId('rule'),
      name: request.name,
      description: request.description,
      enabled: true,
      priority: request.priority ?? pipeline.routingRules.length + 1,
      conditions: request.conditions,
      conditionLogic: request.conditionLogic ?? 'AND',
      targetQueueId: request.targetQueueId,
      priorityOverride: request.priorityOverride,
      addSkills: request.addSkills,
      matchCount: 0,
    };

    pipeline.routingRules.push(rule);
    pipeline.updatedAt = new Date().toISOString();
    this.pipelines.set(pipeline.id, pipeline);

    this.logger.log(`Created routing rule: ${rule.name} (${rule.id}) in pipeline ${pipeline.name}`);

    return { success: true, rule };
  }

  updateRoutingRule(
    pipelineId: string,
    ruleId: string,
    request: UpdateRoutingRuleRequest
  ): { success: boolean; rule?: RoutingRule; error?: string } {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    const ruleIndex = pipeline.routingRules.findIndex((r) => r.id === ruleId);
    if (ruleIndex === -1) {
      return { success: false, error: 'Routing rule not found' };
    }

    // Validate target queue if changing
    if (request.targetQueueId) {
      const targetQueue = this.queues.get(request.targetQueueId);
      if (!targetQueue) {
        return { success: false, error: 'Target queue not found' };
      }
      if (targetQueue.pipelineId !== pipelineId) {
        return { success: false, error: 'Target queue must belong to the same pipeline' };
      }
    }

    const rule = pipeline.routingRules[ruleIndex];
    const updated: RoutingRule = {
      ...rule,
      ...(request.name !== undefined && { name: request.name }),
      ...(request.description !== undefined && { description: request.description }),
      ...(request.enabled !== undefined && { enabled: request.enabled }),
      ...(request.priority !== undefined && { priority: request.priority }),
      ...(request.conditions !== undefined && { conditions: request.conditions }),
      ...(request.conditionLogic !== undefined && { conditionLogic: request.conditionLogic }),
      ...(request.targetQueueId !== undefined && { targetQueueId: request.targetQueueId }),
      ...(request.priorityOverride !== undefined && { priorityOverride: request.priorityOverride }),
      ...(request.addSkills !== undefined && { addSkills: request.addSkills }),
    };

    pipeline.routingRules[ruleIndex] = updated;
    pipeline.updatedAt = new Date().toISOString();
    this.pipelines.set(pipelineId, pipeline);

    this.logger.log(`Updated routing rule: ${updated.name} (${ruleId})`);

    return { success: true, rule: updated };
  }

  deleteRoutingRule(pipelineId: string, ruleId: string): { success: boolean; error?: string } {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    const ruleIndex = pipeline.routingRules.findIndex((r) => r.id === ruleId);
    if (ruleIndex === -1) {
      return { success: false, error: 'Routing rule not found' };
    }

    const rule = pipeline.routingRules[ruleIndex];
    pipeline.routingRules.splice(ruleIndex, 1);
    pipeline.updatedAt = new Date().toISOString();
    this.pipelines.set(pipelineId, pipeline);

    this.logger.log(`Deleted routing rule: ${rule.name} (${ruleId})`);

    return { success: true };
  }

  // ===========================================================================
  // ROUTING ENGINE
  // ===========================================================================

  /**
   * Route a task to the appropriate queue within a pipeline.
   * Returns detailed diagnostics for debugging and user feedback.
   */
  routeTask(
    pipelineId: string,
    taskData: TaskFromSource
  ): {
    queueId: string | null;
    ruleId?: string;
    ruleName?: string;
    error?: string;
    diagnostics?: {
      rulesEvaluated: number;
      ruleResults: Array<{
        ruleId: string;
        ruleName: string;
        matched: boolean;
        conditionResults: Array<{
          field: string;
          operator: string;
          expectedValue: string;
          actualValue: string | undefined;
          matched: boolean;
          reason?: string;
        }>;
      }>;
      availableFields: string[];
    };
  } {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      return { queueId: null, error: 'Pipeline not found' };
    }

    if (!pipeline.enabled) {
      return { queueId: null, error: 'Pipeline is disabled' };
    }

    // Collect available metadata fields for diagnostics
    const availableFields = Object.keys(taskData.metadata || {});

    // Evaluate rules in priority order
    const sortedRules = [...pipeline.routingRules]
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    const ruleResults: Array<{
      ruleId: string;
      ruleName: string;
      matched: boolean;
      conditionResults: Array<{
        field: string;
        operator: string;
        expectedValue: string;
        actualValue: string | undefined;
        matched: boolean;
        reason?: string;
      }>;
    }> = [];

    for (const rule of sortedRules) {
      const conditionResults = this.evaluateRuleDetailed(rule, taskData);
      const allConditionsResults = conditionResults.map((c) => c.matched);
      const ruleMatched =
        rule.conditionLogic === 'AND'
          ? allConditionsResults.every((r) => r)
          : allConditionsResults.some((r) => r);

      ruleResults.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matched: ruleMatched,
        conditionResults,
      });

      if (ruleMatched) {
        // Update match count
        rule.matchCount++;
        rule.lastMatchedAt = new Date().toISOString();
        this.pipelines.set(pipelineId, pipeline);

        this.logger.debug(
          `Task routed by rule "${rule.name}" to queue ${rule.targetQueueId}`
        );

        return {
          queueId: rule.targetQueueId,
          ruleId: rule.id,
          ruleName: rule.name,
          diagnostics: {
            rulesEvaluated: sortedRules.length,
            ruleResults,
            availableFields,
          },
        };
      }
    }

    // No rules matched — log why
    if (sortedRules.length > 0) {
      this.logger.warn(
        `No routing rules matched for task "${taskData.externalId}" in pipeline ${pipelineId}. ` +
        `Available metadata fields: [${availableFields.join(', ')}]`
      );
    }

    const diagnostics = {
      rulesEvaluated: sortedRules.length,
      ruleResults,
      availableFields,
    };

    // No rules matched - use default routing
    if (pipeline.defaultRouting.behavior === 'route_to_queue') {
      if (pipeline.defaultRouting.defaultQueueId) {
        this.logger.debug(
          `Task routed to default queue ${pipeline.defaultRouting.defaultQueueId}`
        );
        return { queueId: pipeline.defaultRouting.defaultQueueId, diagnostics };
      }
    }

    if (pipeline.defaultRouting.behavior === 'reject') {
      return { queueId: null, error: 'No routing rules matched and default behavior is reject', diagnostics };
    }

    // Hold behavior - return null but no error
    return { queueId: null, diagnostics };
  }

  /**
   * Evaluate a routing rule against task data with detailed per-condition diagnostics.
   */
  private evaluateRuleDetailed(
    rule: RoutingRule,
    taskData: TaskFromSource
  ): Array<{
    field: string;
    operator: string;
    expectedValue: string;
    actualValue: string | undefined;
    matched: boolean;
    reason?: string;
  }> {
    if (rule.conditions.length === 0) {
      return [{ field: '(none)', operator: 'always', expectedValue: '', actualValue: '', matched: true }];
    }

    return rule.conditions.map((condition) => {
      const resolved = this.resolveFieldValue(condition.field, taskData);
      const result = this.compareValues(resolved.value, condition.operator, condition.value);
      const matched = condition.negate ? !result : result;

      return {
        field: condition.field,
        operator: condition.operator,
        expectedValue: String(condition.value),
        actualValue: resolved.value !== undefined ? String(resolved.value) : undefined,
        matched,
        reason: resolved.value === undefined
          ? `Field "${condition.field}" not found in task data.${resolved.suggestion ? ' ' + resolved.suggestion : ''}`
          : !matched
            ? `"${resolved.value}" does not match "${condition.value}" with operator "${condition.operator}"`
            : undefined,
      };
    });
  }

  /**
   * Resolve a field value from task data.
   * Uses case-insensitive fallback if exact match fails.
   */
  private resolveFieldValue(
    fieldName: string,
    taskData: TaskFromSource
  ): { value: string | number | string[] | undefined; suggestion?: string } {
    // Well-known task properties (backwards compatible)
    const wellKnownFields: Record<string, () => string | number | string[] | undefined> = {
      workType: () => taskData.workType,
      priority: () => taskData.priority,
      externalId: () => taskData.externalId,
      title: () => taskData.title,
      skills: () => taskData.skills,
      source: () => taskData.metadata?.['_source'],
    };

    const wellKnownGetter = wellKnownFields[fieldName];
    if (wellKnownGetter) {
      return { value: wellKnownGetter() };
    }

    if (!taskData.metadata) {
      return { value: undefined, suggestion: 'Task has no metadata.' };
    }

    // Exact match first
    if (fieldName in taskData.metadata) {
      return { value: taskData.metadata[fieldName] };
    }

    // Case-insensitive fallback
    const lowerField = fieldName.toLowerCase();
    const metaKeys = Object.keys(taskData.metadata);
    const caseMatch = metaKeys.find((k) => k.toLowerCase() === lowerField);
    if (caseMatch) {
      this.logger.warn(
        `Field "${fieldName}" not found but "${caseMatch}" exists (case mismatch). Using "${caseMatch}".`
      );
      return { value: taskData.metadata[caseMatch] };
    }

    // Trimmed-key fallback (whitespace in CSV headers)
    const trimMatch = metaKeys.find((k) => k.trim().toLowerCase() === lowerField);
    if (trimMatch) {
      this.logger.warn(
        `Field "${fieldName}" matched after trimming whitespace from "${trimMatch}".`
      );
      return { value: taskData.metadata[trimMatch] };
    }

    // No match — suggest close matches
    const suggestions = metaKeys.filter((k) => k.toLowerCase().includes(lowerField) || lowerField.includes(k.toLowerCase()));
    const suggestion = suggestions.length > 0
      ? `Did you mean: ${suggestions.slice(0, 3).map(s => `"${s}"`).join(', ')}? Available: [${metaKeys.join(', ')}]`
      : `Available fields: [${metaKeys.join(', ')}]`;
    return { value: undefined, suggestion };
  }

  /**
   * Compare values using the specified operator
   */
  private compareValues(
    fieldValue: string | number | string[] | undefined,
    operator: string,
    compareValue: string | number | string[] | number[]
  ): boolean {
    // Handle exists/not_exists first
    if (operator === 'exists') {
      return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
    }
    if (operator === 'not_exists') {
      return fieldValue === undefined || fieldValue === null || fieldValue === '';
    }

    // If field doesn't exist, most comparisons fail
    if (fieldValue === undefined || fieldValue === null) {
      return false;
    }

    const fieldStr = String(fieldValue).toLowerCase();
    const compareStr = String(compareValue).toLowerCase();

    switch (operator) {
      case 'equals':
        return fieldStr === compareStr;

      case 'not_equals':
        return fieldStr !== compareStr;

      case 'contains':
        return fieldStr.includes(compareStr);

      case 'starts_with':
        return fieldStr.startsWith(compareStr);

      case 'ends_with':
        return fieldStr.endsWith(compareStr);

      case 'matches':
        try {
          return new RegExp(String(compareValue), 'i').test(String(fieldValue));
        } catch {
          return false;
        }

      case 'in':
        const inList = Array.isArray(compareValue)
          ? compareValue.map((v) => String(v).toLowerCase())
          : String(compareValue).split(',').map((v) => v.trim().toLowerCase());
        return inList.includes(fieldStr);

      case 'not_in':
        const notInList = Array.isArray(compareValue)
          ? compareValue.map((v) => String(v).toLowerCase())
          : String(compareValue).split(',').map((v) => v.trim().toLowerCase());
        return !notInList.includes(fieldStr);

      case 'greater_than':
        return Number(fieldValue) > Number(compareValue);

      case 'less_than':
        return Number(fieldValue) < Number(compareValue);

      case 'greater_or_equal':
        return Number(fieldValue) >= Number(compareValue);

      case 'less_or_equal':
        return Number(fieldValue) <= Number(compareValue);

      case 'between':
        if (Array.isArray(compareValue) && compareValue.length === 2) {
          const num = Number(fieldValue);
          return num >= Number(compareValue[0]) && num <= Number(compareValue[1]);
        }
        return false;

      default:
        return false;
    }
  }

  // ===========================================================================
  // AGENT ACCESS
  // ===========================================================================

  getAgentAccess(pipelineId: string): AgentPipelineAccess[] {
    return this.agentAccess.get(pipelineId) || [];
  }

  getAgentPipelines(agentId: string): AgentPipelineAccess[] {
    const allAccess: AgentPipelineAccess[] = [];
    this.agentAccess.forEach((accessList) => {
      const agentAccess = accessList.filter((a) => a.agentId === agentId);
      allAccess.push(...agentAccess);
    });
    return allAccess;
  }

  grantAgentAccess(
    agentId: string,
    pipelineId: string,
    accessLevel: 'full' | 'partial',
    queueIds?: string[],
    assignedBy = 'system'
  ): { success: boolean; access?: AgentPipelineAccess; error?: string } {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    // Validate queue IDs if partial access
    if (accessLevel === 'partial' && queueIds) {
      for (const queueId of queueIds) {
        const queue = this.queues.get(queueId);
        if (!queue || queue.pipelineId !== pipelineId) {
          return { success: false, error: `Queue ${queueId} not found or not in this pipeline` };
        }
      }
    }

    const access: AgentPipelineAccess = {
      agentId,
      pipelineId,
      accessLevel,
      queueIds: accessLevel === 'partial' ? queueIds : undefined,
      autoRoutingEnabled: true,
      assignedAt: new Date().toISOString(),
      assignedBy,
    };

    // Get or create access list for pipeline
    const accessList = this.agentAccess.get(pipelineId) || [];

    // Remove existing access for this agent
    const filteredList = accessList.filter((a) => a.agentId !== agentId);
    filteredList.push(access);

    this.agentAccess.set(pipelineId, filteredList);
    this.logger.log(
      `Granted ${accessLevel} access to agent ${agentId} for pipeline ${pipeline.name}`
    );

    return { success: true, access };
  }

  revokeAgentAccess(
    agentId: string,
    pipelineId: string
  ): { success: boolean; error?: string } {
    const accessList = this.agentAccess.get(pipelineId);
    if (!accessList) {
      return { success: false, error: 'No access records found for pipeline' };
    }

    const filteredList = accessList.filter((a) => a.agentId !== agentId);
    if (filteredList.length === accessList.length) {
      return { success: false, error: 'Agent does not have access to this pipeline' };
    }

    this.agentAccess.set(pipelineId, filteredList);
    this.logger.log(`Revoked access for agent ${agentId} from pipeline ${pipelineId}`);

    return { success: true };
  }

  /**
   * Check if an agent can work a specific queue
   */
  canAgentWorkQueue(agentId: string, queueId: string): boolean {
    const queue = this.queues.get(queueId);
    if (!queue) return false;

    const accessList = this.agentAccess.get(queue.pipelineId) || [];
    const agentAccess = accessList.find((a) => a.agentId === agentId);

    if (!agentAccess) return false;

    if (agentAccess.accessLevel === 'full') {
      return true;
    }

    return agentAccess.queueIds?.includes(queueId) ?? false;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }
}
