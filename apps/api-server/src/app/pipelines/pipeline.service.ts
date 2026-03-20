import { Injectable, Logger, Optional, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PipelineVersionService } from './pipeline-version.service';
import {
  Pipeline,
  PipelineQueue,
  RoutingRule,
  RoutingCondition,
  AgentPipelineAccess,
  PipelineSummary,
  PipelineWithDetails,
  PipelineValidationRequest,
  PipelineValidationResult,
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
  PipelineBundle,
  PipelineImportResult,
} from '@nexus-queue/shared-models';
import { PipelineEntity } from '../entities/pipeline.entity';
import { PipelineQueueEntity } from '../entities/pipeline-queue.entity';

@Injectable()
export class PipelineService implements OnModuleInit {
  private readonly logger = new Logger(PipelineService.name);

  /** In-memory caches; loaded from DB on init */
  private pipelines = new Map<string, Pipeline>();
  private queues = new Map<string, PipelineQueue>();

  /** Not persisted — runtime access control state */
  private agentAccess = new Map<string, AgentPipelineAccess[]>();

  constructor(
    @InjectRepository(PipelineEntity)
    private readonly pipelineRepo: Repository<PipelineEntity>,
    @InjectRepository(PipelineQueueEntity)
    private readonly queueRepo: Repository<PipelineQueueEntity>,
    @Optional() private readonly versionService?: PipelineVersionService,
  ) {}

  async onModuleInit(): Promise<void> {
    const pipelineEntities = await this.pipelineRepo.find();
    for (const entity of pipelineEntities) {
      this.pipelines.set(entity.id, this.toPipelineModel(entity));
    }

    const queueEntities = await this.queueRepo.find();
    for (const entity of queueEntities) {
      this.queues.set(entity.id, this.toQueueModel(entity));
    }

    this.logger.log(
      `Loaded ${pipelineEntities.length} pipelines and ${queueEntities.length} queues from DB`
    );
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

  async createPipeline(request: CreatePipelineRequest): Promise<{
    success: boolean;
    pipeline?: Pipeline;
    error?: string;
  }> {
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
      defaultRouting: request.defaultRouting || {
        behavior: 'route_to_queue',
        holdTimeoutSeconds: 300,
        holdTimeoutAction: 'reject',
      },
      stats: { ...DEFAULT_PIPELINE_STATS },
      createdAt: now,
      updatedAt: now,
    };

    await this.pipelineRepo.save(this.toPipelineEntity(pipeline));
    this.pipelines.set(pipeline.id, pipeline);
    this.logger.log(`Created pipeline: ${pipeline.name} (${pipeline.id})`);

    return { success: true, pipeline };
  }

  async updatePipeline(
    id: string,
    request: UpdatePipelineRequest
  ): Promise<{ success: boolean; pipeline?: Pipeline; error?: string }> {
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

    // Snapshot the current state before applying changes
    this.versionService?.snapshotPipeline(pipeline, 'system', 'Pipeline configuration updated');

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

    await this.pipelineRepo.save(this.toPipelineEntity(updated));
    this.pipelines.set(id, updated);
    this.logger.log(`Updated pipeline: ${updated.name} (${id})`);

    return { success: true, pipeline: updated };
  }

  /**
   * Restore a pipeline to a previous version snapshot.
   */
  async rollbackPipeline(pipelineId: string, versionId: string): Promise<{ success: boolean; pipeline?: Pipeline; error?: string }> {
    if (!this.versionService) {
      return { success: false, error: 'Versioning service not available' };
    }

    const snapshot = this.versionService.rollback(pipelineId, versionId);
    if (!snapshot) {
      return { success: false, error: `Version ${versionId} not found for pipeline ${pipelineId}` };
    }

    // Snapshot current state before rollback
    const current = this.pipelines.get(pipelineId);
    if (current) {
      this.versionService.snapshotPipeline(current, 'system', `Rolled back to version ${versionId}`);
    }

    // Restore the snapshot
    const restored: Pipeline = { ...snapshot, updatedAt: new Date().toISOString() };
    await this.pipelineRepo.save(this.toPipelineEntity(restored));
    this.pipelines.set(pipelineId, restored);

    this.logger.log(`Pipeline ${pipelineId} rolled back to version ${versionId}`);
    return { success: true, pipeline: restored };
  }

  async deletePipeline(id: string, cascade = false): Promise<{ success: boolean; error?: string }> {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    const queues = this.getQueuesByPipeline(id);

    if (!cascade && queues.length > 0) {
      return {
        success: false,
        error: `Cannot delete pipeline with ${queues.length} queue(s). Delete queues first or use cascade delete.`,
      };
    }

    if (cascade) {
      for (const queue of queues) {
        await this.queueRepo.delete(queue.id);
        this.queues.delete(queue.id);
      }
      this.logger.log(
        `Cascade deleted ${queues.length} queue(s) and ${pipeline.routingRules.length} routing rule(s) for pipeline ${pipeline.name}`
      );
    }

    await this.pipelineRepo.delete(id);
    this.pipelines.delete(id);
    this.agentAccess.delete(id);
    this.logger.log(`Deleted pipeline: ${pipeline.name} (${id})`);

    return { success: true };
  }

  /**
   * Get an impact summary describing what would be deleted if a pipeline is cascade-deleted.
   */
  getPipelineDeleteImpact(id: string): {
    found: boolean;
    pipelineName?: string;
    queueCount: number;
    routingRuleCount: number;
    agentAccessCount: number;
    queueNames: string[];
    routingRuleNames: string[];
  } {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) {
      return { found: false, queueCount: 0, routingRuleCount: 0, agentAccessCount: 0, queueNames: [], routingRuleNames: [] };
    }

    const queues = this.getQueuesByPipeline(id);
    const agentAccess = this.agentAccess.get(id) || [];

    return {
      found: true,
      pipelineName: pipeline.name,
      queueCount: queues.length,
      routingRuleCount: pipeline.routingRules.length,
      agentAccessCount: agentAccess.length,
      queueNames: queues.map((q) => q.name),
      routingRuleNames: pipeline.routingRules.map((r) => r.name),
    };
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

  async createQueue(request: CreateQueueRequest): Promise<{
    success: boolean;
    queue?: PipelineQueue;
    error?: string;
  }> {
    const pipeline = this.pipelines.get(request.pipelineId);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

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

    await this.queueRepo.save(this.toQueueEntity(queue));
    this.queues.set(queue.id, queue);
    this.logger.log(`Created queue: ${queue.name} (${queue.id}) in pipeline ${pipeline.name}`);

    // Auto-set as default queue if pipeline has route_to_queue behavior but no default yet
    if (
      pipeline.defaultRouting.behavior === 'route_to_queue' &&
      !pipeline.defaultRouting.defaultQueueId
    ) {
      pipeline.defaultRouting.defaultQueueId = queue.id;
      await this.pipelineRepo.save(this.toPipelineEntity(pipeline));
      this.pipelines.set(pipeline.id, pipeline);
      this.logger.log(`Auto-set default queue for pipeline ${pipeline.name}: ${queue.name}`);
    }

    return { success: true, queue };
  }

  async updateQueue(
    id: string,
    request: UpdateQueueRequest
  ): Promise<{ success: boolean; queue?: PipelineQueue; error?: string }> {
    const queue = this.queues.get(id);
    if (!queue) {
      return { success: false, error: 'Queue not found' };
    }

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

    await this.queueRepo.save(this.toQueueEntity(updated));
    this.queues.set(id, updated);
    this.logger.log(`Updated queue: ${updated.name} (${id})`);

    return { success: true, queue: updated };
  }

  async deleteQueue(id: string, cascade = false): Promise<{ success: boolean; error?: string }> {
    const queue = this.queues.get(id);
    if (!queue) {
      return { success: false, error: 'Queue not found' };
    }

    const pipeline = this.pipelines.get(queue.pipelineId);
    if (pipeline) {
      const usedInRules = pipeline.routingRules.filter(
        (r) => r.targetQueueId === id
      );

      if (!cascade) {
        if (usedInRules.length > 0) {
          return {
            success: false,
            error: `Queue is used by ${usedInRules.length} routing rule(s). Update rules first or use cascade delete.`,
          };
        }
        if (pipeline.defaultRouting?.defaultQueueId === id) {
          return {
            success: false,
            error: 'Queue is set as the default routing target. Update default routing first.',
          };
        }
      } else {
        if (usedInRules.length > 0) {
          pipeline.routingRules = pipeline.routingRules.filter(
            (r) => r.targetQueueId !== id
          );
          this.logger.log(
            `Cascade removed ${usedInRules.length} routing rule(s) targeting queue ${queue.name}`
          );
        }
        if (pipeline.defaultRouting?.defaultQueueId === id) {
          pipeline.defaultRouting.defaultQueueId = undefined;
          this.logger.log(`Cleared default queue reference for pipeline ${pipeline.name}`);
        }
        pipeline.updatedAt = new Date().toISOString();
        await this.pipelineRepo.save(this.toPipelineEntity(pipeline));
        this.pipelines.set(pipeline.id, pipeline);
      }
    }

    await this.queueRepo.delete(id);
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

  async createRoutingRule(request: CreateRoutingRuleRequest): Promise<{
    success: boolean;
    rule?: RoutingRule;
    error?: string;
  }> {
    const pipeline = this.pipelines.get(request.pipelineId);
    if (!pipeline) {
      return { success: false, error: 'Pipeline not found' };
    }

    if (!request.targetQueueId && !request.targetPipelineId) {
      return { success: false, error: 'Either targetQueueId or targetPipelineId must be provided' };
    }

    // Validate target queue only for in-pipeline routing
    if (request.targetQueueId) {
      const targetQueue = this.queues.get(request.targetQueueId);
      if (!targetQueue) {
        return { success: false, error: 'Target queue not found' };
      }
      if (targetQueue.pipelineId !== request.pipelineId) {
        return { success: false, error: 'Target queue must belong to the same pipeline' };
      }
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
      targetPipelineId: request.targetPipelineId,
      priorityOverride: request.priorityOverride,
      addSkills: request.addSkills,
      matchCount: 0,
    };

    pipeline.routingRules.push(rule);
    pipeline.updatedAt = new Date().toISOString();
    await this.pipelineRepo.save(this.toPipelineEntity(pipeline));
    this.pipelines.set(pipeline.id, pipeline);

    this.logger.log(`Created routing rule: ${rule.name} (${rule.id}) in pipeline ${pipeline.name}`);

    return { success: true, rule };
  }

  async updateRoutingRule(
    pipelineId: string,
    ruleId: string,
    request: UpdateRoutingRuleRequest
  ): Promise<{ success: boolean; rule?: RoutingRule; error?: string }> {
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
    await this.pipelineRepo.save(this.toPipelineEntity(pipeline));
    this.pipelines.set(pipelineId, pipeline);

    this.logger.log(`Updated routing rule: ${updated.name} (${ruleId})`);

    return { success: true, rule: updated };
  }

  async deleteRoutingRule(pipelineId: string, ruleId: string): Promise<{ success: boolean; error?: string }> {
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
    await this.pipelineRepo.save(this.toPipelineEntity(pipeline));
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
    /** Set when the matched rule targets another pipeline instead of a queue */
    targetPipelineId?: string;
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

        if (rule.targetPipelineId) {
          // Cross-pipeline transfer rule
          this.logger.debug(
            `Task routed by rule "${rule.name}" to pipeline ${rule.targetPipelineId}`
          );
          return {
            queueId: null,
            targetPipelineId: rule.targetPipelineId,
            ruleId: rule.id,
            ruleName: rule.name,
            diagnostics: {
              rulesEvaluated: sortedRules.length,
              ruleResults,
              availableFields,
            },
          };
        }

        this.logger.debug(
          `Task routed by rule "${rule.name}" to queue ${rule.targetQueueId}`
        );

        return {
          queueId: rule.targetQueueId ?? null,
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

      case 'in': {
        const inList = Array.isArray(compareValue)
          ? compareValue.map((v) => String(v).toLowerCase())
          : String(compareValue).split(',').map((v) => v.trim().toLowerCase());
        return inList.includes(fieldStr);
      }

      case 'not_in': {
        const notInList = Array.isArray(compareValue)
          ? compareValue.map((v) => String(v).toLowerCase())
          : String(compareValue).split(',').map((v) => v.trim().toLowerCase());
        return !notInList.includes(fieldStr);
      }

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
  // VALIDATION (dry-run)
  // ===========================================================================

  /**
   * Validate a pipeline configuration against sample task data.
   * This is a pure dry-run: no pipeline state is mutated (matchCount not incremented).
   */
  validatePipelineConfig(
    pipelineId: string,
    request: PipelineValidationRequest
  ): PipelineValidationResult {
    const pipeline = this.pipelines.get(pipelineId);
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pipeline) {
      return { valid: false, errors: ['Pipeline not found'], warnings };
    }

    if (!pipeline.enabled) {
      warnings.push('Pipeline is currently inactive');
    }

    // Build a TaskFromSource-compatible object from the sampleTask
    const sampleTask = request.sampleTask;
    const taskData: TaskFromSource = {
      externalId: (sampleTask['externalId'] as string) || 'validation-sample',
      workType: (sampleTask['workType'] as string) || pipeline.defaults?.workType || 'GENERAL',
      title: (sampleTask['title'] as string) || 'Validation Sample Task',
      description: sampleTask['description'] as string | undefined,
      priority: (sampleTask['priority'] as number) ?? pipeline.defaults?.priority ?? 5,
      queue: sampleTask['queue'] as string | undefined,
      skills: sampleTask['skills'] as string[] | undefined,
      payloadUrl: (sampleTask['payloadUrl'] as string) || '',
      metadata: {} as Record<string, string>,
    };

    // Move remaining fields into metadata
    for (const [key, value] of Object.entries(sampleTask)) {
      if (!['externalId', 'workType', 'title', 'description', 'priority', 'queue', 'skills', 'payloadUrl'].includes(key)) {
        taskData.metadata[key] = String(value);
      }
    }

    // Validate work type
    if (pipeline.allowedWorkTypes.length > 0 && !pipeline.allowedWorkTypes.includes(taskData.workType)) {
      warnings.push(`Work type "${taskData.workType}" is not in the pipeline's allowed work types: [${pipeline.allowedWorkTypes.join(', ')}]`);
    }

    // Dry-run routing evaluation — evaluate rules WITHOUT mutating matchCount
    const sortedRules = [...pipeline.routingRules]
      .filter((r) => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    let targetQueue: PipelineValidationResult['targetQueue'];
    let routingRuleMatched: PipelineValidationResult['routingRuleMatched'];

    for (const rule of sortedRules) {
      const conditionResults = this.evaluateRuleDetailed(rule, taskData);
      const matched =
        rule.conditionLogic === 'AND'
          ? conditionResults.every((c) => c.matched)
          : conditionResults.some((c) => c.matched);

      if (matched) {
        const queue = this.queues.get(rule.targetQueueId);
        targetQueue = queue
          ? { id: queue.id, name: queue.name }
          : { id: rule.targetQueueId, name: '(queue not found)' };
        routingRuleMatched = { id: rule.id, name: rule.name };

        if (!queue) {
          errors.push(`Routing rule "${rule.name}" targets queue "${rule.targetQueueId}" which does not exist`);
        }
        break;
      }
    }

    if (!routingRuleMatched) {
      // Check default routing
      if (pipeline.defaultRouting.behavior === 'route_to_queue' && pipeline.defaultRouting.defaultQueueId) {
        const defaultQueue = this.queues.get(pipeline.defaultRouting.defaultQueueId);
        targetQueue = defaultQueue
          ? { id: defaultQueue.id, name: defaultQueue.name }
          : { id: pipeline.defaultRouting.defaultQueueId, name: '(queue not found)' };
        if (!defaultQueue) {
          errors.push(`Default queue "${pipeline.defaultRouting.defaultQueueId}" does not exist`);
        }
      } else if (pipeline.defaultRouting.behavior === 'reject') {
        errors.push('No routing rules matched and the default behavior is to reject the task');
      } else {
        warnings.push('No routing rules matched — task would be held');
      }
    }

    const valid = errors.length === 0;
    return { valid, targetQueue, routingRuleMatched, errors, warnings };
  }

  // ===========================================================================
  // PORTABILITY — EXPORT / IMPORT / CLONE
  // ===========================================================================

  /**
   * Export a pipeline and all its queues/routing rules as a portable bundle.
   * Queue IDs are replaced by queue names so the bundle is importable into
   * any environment.
   */
  exportPipeline(id: string): PipelineBundle | null {
    const pipeline = this.pipelines.get(id);
    if (!pipeline) return null;

    const queues = this.getQueuesByPipeline(id);
    const queueIdToName = new Map(queues.map((q) => [q.id, q.name]));

    return {
      exportVersion: '1',
      exportedAt: new Date().toISOString(),
      pipeline: {
        name: pipeline.name,
        description: pipeline.description,
        workTypes: pipeline.allowedWorkTypes,
        dataSchema: pipeline.dataSchema ? [pipeline.dataSchema] : [],
        sla: pipeline.sla,
        callbackUrl: pipeline.callbackUrl,
        callbackEvents: pipeline.callbackEvents,
      },
      queues: queues.map((q) => ({
        name: q.name,
        priority: q.priority,
        requiredSkills: q.requiredSkills ?? [],
        maxCapacity: q.maxCapacity,
      })),
      routingRules: pipeline.routingRules.map((r) => ({
        name: r.name,
        priority: r.priority,
        conditions: r.conditions,
        targetQueueName: r.targetQueueId ? queueIdToName.get(r.targetQueueId) : undefined,
        targetPipelineId: r.targetPipelineId,
      })),
      ruleSets: [],
    };
  }

  /**
   * Import a pipeline bundle, creating a new pipeline with fresh IDs.
   * Queue names referenced in routing rules are resolved to new IDs via the
   * name→id map built during queue creation.
   */
  async importPipeline(bundle: PipelineBundle): Promise<PipelineImportResult> {
    const errors: Array<{ field: string; message: string }> = [];

    if (!bundle.pipeline?.name?.trim()) {
      errors.push({ field: 'pipeline.name', message: 'Pipeline name is required' });
    }
    if (bundle.exportVersion !== '1') {
      errors.push({ field: 'exportVersion', message: 'Unsupported bundle version' });
    }
    if (!Array.isArray(bundle.queues)) {
      errors.push({ field: 'queues', message: 'Queues must be an array' });
    }
    if (!Array.isArray(bundle.routingRules)) {
      errors.push({ field: 'routingRules', message: 'Routing rules must be an array' });
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    const now = new Date().toISOString();
    const newPipelineId = this.generateId('pipeline');

    const pipeline: Pipeline = {
      id: newPipelineId,
      name: bundle.pipeline.name,
      description: bundle.pipeline.description,
      enabled: false,
      allowedWorkTypes: bundle.pipeline.workTypes ?? [],
      defaults: { ...DEFAULT_PIPELINE_DEFAULTS },
      sla: bundle.pipeline.sla,
      callbackUrl: bundle.pipeline.callbackUrl,
      callbackEvents: bundle.pipeline.callbackEvents as Pipeline['callbackEvents'],
      routingRules: [],
      defaultRouting: { behavior: 'hold', holdTimeoutSeconds: 300, holdTimeoutAction: 'reject' },
      stats: { ...DEFAULT_PIPELINE_STATS },
      createdAt: now,
      updatedAt: now,
    };

    await this.pipelineRepo.save(this.toPipelineEntity(pipeline));
    this.pipelines.set(pipeline.id, pipeline);

    const queueNameToId = new Map<string, string>();
    for (const qDef of bundle.queues) {
      const queue: PipelineQueue = {
        id: this.generateId('queue'),
        name: qDef.name,
        pipelineId: newPipelineId,
        enabled: true,
        priority: qDef.priority,
        requiredSkills: qDef.requiredSkills,
        maxCapacity: qDef.maxCapacity ?? 0,
        stats: { ...DEFAULT_PIPELINE_QUEUE_STATS },
        createdAt: now,
        updatedAt: now,
      };
      await this.queueRepo.save(this.toQueueEntity(queue));
      this.queues.set(queue.id, queue);
      queueNameToId.set(queue.name, queue.id);
    }

    const rules: RoutingRule[] = bundle.routingRules.map((rDef, index) => ({
      id: this.generateId('rule'),
      name: rDef.name,
      enabled: true,
      priority: rDef.priority ?? index + 1,
      conditions: rDef.conditions ?? [],
      conditionLogic: 'AND' as const,
      targetQueueId: rDef.targetQueueName ? queueNameToId.get(rDef.targetQueueName) : undefined,
      targetPipelineId: rDef.targetPipelineId,
      matchCount: 0,
    }));

    pipeline.routingRules = rules;
    pipeline.updatedAt = new Date().toISOString();
    await this.pipelineRepo.save(this.toPipelineEntity(pipeline));
    this.pipelines.set(pipeline.id, pipeline);

    this.logger.log(`Imported pipeline "${pipeline.name}" as ${newPipelineId}`);
    return { success: true, pipelineId: newPipelineId };
  }

  /**
   * Clone an existing pipeline, creating a new inactive copy with "(Copy)" suffix.
   * All queues and routing rules are duplicated with fresh IDs; routing rule target
   * queue references are remapped to the new queue IDs.
   */
  async clonePipeline(id: string): Promise<{ success: boolean; pipeline?: Pipeline; error?: string }> {
    const source = this.pipelines.get(id);
    if (!source) {
      return { success: false, error: 'Pipeline not found' };
    }

    const now = new Date().toISOString();
    const newPipelineId = this.generateId('pipeline');

    const clone: Pipeline = {
      ...source,
      id: newPipelineId,
      name: `${source.name} (Copy)`,
      enabled: false,
      routingRules: [],
      stats: { ...DEFAULT_PIPELINE_STATS },
      createdAt: now,
      updatedAt: now,
    };

    await this.pipelineRepo.save(this.toPipelineEntity(clone));
    this.pipelines.set(clone.id, clone);

    const sourceQueues = this.getQueuesByPipeline(id);
    const oldIdToNew = new Map<string, string>();

    for (const q of sourceQueues) {
      const newQueueId = this.generateId('queue');
      oldIdToNew.set(q.id, newQueueId);

      const clonedQueue: PipelineQueue = {
        ...q,
        id: newQueueId,
        pipelineId: newPipelineId,
        stats: { ...DEFAULT_PIPELINE_QUEUE_STATS },
        createdAt: now,
        updatedAt: now,
      };
      await this.queueRepo.save(this.toQueueEntity(clonedQueue));
      this.queues.set(clonedQueue.id, clonedQueue);
    }

    clone.routingRules = source.routingRules.map((r) => ({
      ...r,
      id: this.generateId('rule'),
      targetQueueId: r.targetQueueId ? (oldIdToNew.get(r.targetQueueId) ?? r.targetQueueId) : undefined,
      matchCount: 0,
      lastMatchedAt: undefined,
    }));

    clone.updatedAt = new Date().toISOString();
    await this.pipelineRepo.save(this.toPipelineEntity(clone));
    this.pipelines.set(clone.id, clone);

    this.logger.log(`Cloned pipeline "${source.name}" → "${clone.name}" (${newPipelineId})`);
    return { success: true, pipeline: clone };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private generateId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  }

  // ===========================================================================
  // ENTITY MAPPING
  // ===========================================================================

  private toPipelineEntity(pipeline: Pipeline): PipelineEntity {
    const entity = new PipelineEntity();
    entity.id = pipeline.id;
    entity.name = pipeline.name;
    entity.description = pipeline.description;
    entity.enabled = pipeline.enabled;
    entity.allowedWorkTypes = pipeline.allowedWorkTypes;
    entity.defaults = pipeline.defaults as unknown as Record<string, unknown> | undefined;
    entity.sla = pipeline.sla as unknown as Record<string, unknown> | undefined;
    entity.routingRules = pipeline.routingRules as unknown as Record<string, unknown>[];
    entity.defaultRouting = pipeline.defaultRouting as unknown as Record<string, unknown>;
    entity.stats = pipeline.stats as unknown as Record<string, unknown>;
    return entity;
  }

  private toPipelineModel(entity: PipelineEntity): Pipeline {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      enabled: entity.enabled,
      allowedWorkTypes: entity.allowedWorkTypes ?? [],
      defaults: entity.defaults as unknown as Pipeline['defaults'],
      sla: entity.sla as unknown as Pipeline['sla'],
      routingRules: (entity.routingRules ?? []) as unknown as RoutingRule[],
      defaultRouting: (entity.defaultRouting ?? { behavior: 'hold', holdTimeoutSeconds: 300, holdTimeoutAction: 'reject' }) as unknown as Pipeline['defaultRouting'],
      stats: (entity.stats ?? { ...DEFAULT_PIPELINE_STATS }) as unknown as Pipeline['stats'],
      createdAt: entity.createdAt instanceof Date ? entity.createdAt.toISOString() : entity.createdAt,
      updatedAt: entity.updatedAt instanceof Date ? entity.updatedAt.toISOString() : entity.updatedAt,
    };
  }

  private toQueueEntity(queue: PipelineQueue): PipelineQueueEntity {
    const entity = new PipelineQueueEntity();
    entity.id = queue.id;
    entity.pipelineId = queue.pipelineId;
    entity.name = queue.name;
    entity.description = queue.description;
    entity.enabled = queue.enabled;
    entity.priority = queue.priority;
    entity.requiredSkills = queue.requiredSkills;
    entity.preferredSkills = queue.preferredSkills;
    entity.maxCapacity = queue.maxCapacity ?? 0;
    entity.slaOverrides = queue.slaOverrides as unknown as Record<string, unknown> | undefined;
    entity.stats = queue.stats as unknown as Record<string, unknown>;
    return entity;
  }

  private toQueueModel(entity: PipelineQueueEntity): PipelineQueue {
    return {
      id: entity.id,
      pipelineId: entity.pipelineId,
      name: entity.name,
      description: entity.description,
      enabled: entity.enabled,
      priority: entity.priority,
      requiredSkills: entity.requiredSkills,
      preferredSkills: entity.preferredSkills,
      maxCapacity: entity.maxCapacity,
      slaOverrides: entity.slaOverrides as unknown as PipelineQueue['slaOverrides'],
      stats: (entity.stats ?? { ...DEFAULT_PIPELINE_QUEUE_STATS }) as unknown as PipelineQueue['stats'],
      createdAt: entity.createdAt instanceof Date ? entity.createdAt.toISOString() : entity.createdAt,
      updatedAt: entity.updatedAt instanceof Date ? entity.updatedAt.toISOString() : entity.updatedAt,
    };
  }
}
