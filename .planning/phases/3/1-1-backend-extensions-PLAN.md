<plan>
  <name>Backend Extensions — Rule Wiring, DLQ API, Validation, Metrics, Versioning</name>
  <wave>1</wave>
  <requirements>P3-014, P3-023, P3-033, P3-040, P3-041, P3-042, P3-043, P3-050, P3-051, P3-052</requirements>

  <files>
    <!-- Shared models — add new types -->
    libs/shared-models/src/lib/pipeline.interface.ts
    libs/shared-models/src/lib/rule.interface.ts
    libs/shared-models/src/index.ts

    <!-- Orchestration — wire RuleEngine -->
    apps/api-server/src/app/services/pipeline-orchestrator.service.ts

    <!-- Pipeline controller — add validate endpoint -->
    apps/api-server/src/app/pipelines/pipeline.controller.ts

    <!-- New: pipeline metrics service -->
    apps/api-server/src/app/pipelines/pipeline-metrics.service.ts

    <!-- New: pipeline version service -->
    apps/api-server/src/app/pipelines/pipeline-version.service.ts

    <!-- Pipeline module — register new services -->
    apps/api-server/src/app/pipelines/pipelines.module.ts

    <!-- Rules controller — add test endpoint -->
    apps/api-server/src/app/rules/rules.controller.ts

    <!-- New: DLQ controller -->
    apps/api-server/src/app/queues/dlq.controller.ts

    <!-- Queues module — register DLQ controller -->
    apps/api-server/src/app/queues/queues.module.ts

    <!-- Gateway — pipeline metrics broadcast -->
    apps/api-server/src/app/gateway/agent.gateway.ts
  </files>

  <tasks>
    <task id="1">
      <name>Add shared model types for Phase 3</name>
      <action>
        In `libs/shared-models/src/lib/pipeline.interface.ts`, add:
        - `PipelineMetrics` interface: `{ pipelineId, pipelineName, status, tasksIngested, tasksCompleted, tasksInQueue, tasksFailed, slaCompliancePercent, avgHandleTimeMs, errorRatePercent, lastUpdated }`
        - `PipelineMetricsSummary` interface: `{ pipelines: PipelineMetrics[], totalIngested, totalCompleted, totalInQueue, totalFailed }`
        - `PipelineValidationRequest` interface: `{ sampleTask: Record&lt;string, unknown&gt;, includeRuleTrace?: boolean }`
        - `PipelineValidationResult` interface: `{ valid, targetQueue?, routingRuleMatched?, ruleTrace?, appliedRuleActions?, errors: string[], warnings: string[] }`
        - `PipelineVersion` interface: `{ versionId, pipelineId, snapshot: Pipeline, createdAt, changedBy, changeNote }`

        In `libs/shared-models/src/lib/rule.interface.ts`, add:
        - `RuleSetTestRequest` interface: `{ sampleTask: Record&lt;string, unknown&gt; }`
        - `RuleSetTestResponse` interface: `{ taskBefore: Record&lt;string, unknown&gt;, taskAfter: Record&lt;string, unknown&gt;, rulesEvaluated: Array&lt;{ ruleId, ruleName, matched, actionsApplied }&gt;, stoppedAt?: string }`

        Ensure `libs/shared-models/src/index.ts` exports all new types.
      </action>
      <files>
        libs/shared-models/src/lib/pipeline.interface.ts
        libs/shared-models/src/lib/rule.interface.ts
        libs/shared-models/src/index.ts
      </files>
      <verify>npx nx build shared-models</verify>
      <done>
        - `PipelineMetrics`, `PipelineValidationRequest`, `PipelineValidationResult`, `PipelineVersion` defined and exported
        - `RuleSetTestRequest`, `RuleSetTestResponse` defined and exported
        - `npx nx build shared-models` passes with zero TypeScript errors
      </done>
    </task>

    <task id="2">
      <name>Wire RuleEngineService into PipelineOrchestratorService</name>
      <action>
        In `apps/api-server/src/app/services/pipeline-orchestrator.service.ts`:
        1. Inject `RuleEngineService` via constructor (import from `../services/rule-engine.service`)
        2. After `validateTask()` and before `routeTask()`, call:
           ```typescript
           const activeRuleSets = this.ruleEngineService.getRuleSetsForPipeline(pipelineId);
           for (const ruleSet of activeRuleSets) {
             const result = this.ruleEngineService.evaluateRuleSet(ruleSet, task);
             task = this.ruleEngineService.applyActions(task, result.appliedActions);
             if (result.stopped) break;
           }
           ```
        3. `getRuleSetsForPipeline(pipelineId)` — add this method to `RuleEngineService` in
           `apps/api-server/src/app/services/rule-engine.service.ts`. It returns rule sets
           scoped to the pipeline (check `ruleSet.scope.pipelineIds` or global scope if not set).

        The task is mutated in-place before routing, so priority adjustments and skill additions
        from rules affect routing decisions.
      </action>
      <files>
        apps/api-server/src/app/services/pipeline-orchestrator.service.ts
        apps/api-server/src/app/services/rule-engine.service.ts
      </files>
      <verify>npx nx build api-server</verify>
      <done>
        - `PipelineOrchestratorService` constructor injects `RuleEngineService`
        - `getRuleSetsForPipeline(pipelineId)` method exists on `RuleEngineService`
        - Rule evaluation runs before routing in the orchestration flow
        - Build passes with no TypeScript errors
      </done>
    </task>

    <task id="3">
      <name>Add DLQ controller with filter, retry, reroute, discard endpoints</name>
      <action>
        Create `apps/api-server/src/app/queues/dlq.controller.ts`:

        ```
        @Controller('queues/dlq')
        export class DlqController {
          constructor(
            private readonly queueManager: QueueManagerService,
            private readonly orchestrator: PipelineOrchestratorService,
          ) {}

          // GET /api/queues/dlq
          // Query params: pipelineId?, queueId?, reason?, fromDate?, toDate?, limit?, offset?
          @Get()
          getDlqTasks(@Query() query: DlqQueryDto): DLQEntry[]

          // GET /api/queues/dlq/stats
          @Get('stats')
          getDlqStats(): { total, byReason, byQueue, byPipeline }

          // POST /api/queues/dlq/:taskId/retry
          // Re-ingest through full pipeline (uses orchestrator.retryFromDLQ)
          @Post(':taskId/retry')
          retryTask(@Param('taskId') taskId: string): void

          // POST /api/queues/dlq/:taskId/reroute
          // Body: { targetQueueId: string }
          // Moves task to different queue (skipping routing rules)
          @Post(':taskId/reroute')
          rerouteTask(@Param('taskId') taskId: string, @Body() body: { targetQueueId: string }): void

          // DELETE /api/queues/dlq/:taskId
          // Permanently removes from DLQ
          @Delete(':taskId')
          discardTask(@Param('taskId') taskId: string): void
        }
        ```

        Create `DlqQueryDto` with validation decorators for query params.
        Add `DlqController` to `apps/api-server/src/app/queues/queues.module.ts` controllers array.

        For `reroute`: call `queueManager.removeFromDLQ(taskId)` then
        `queueManager.enqueue(targetQueueId, queuedTask)`.
        For `retry`: call `orchestrator.retryFromDLQ(taskId)` (already exists).
        For `discard`: call `queueManager.removeFromDLQ(taskId)` and discard result.

        Add `getDlqStats()` to `QueueManagerService` aggregating count by reason, queue, and
        pipeline (infer pipelineId from queue's pipeline association via `PipelineService`).
      </action>
      <files>
        apps/api-server/src/app/queues/dlq.controller.ts
        apps/api-server/src/app/queues/queues.module.ts
        apps/api-server/src/app/services/queue-manager.service.ts
      </files>
      <verify>npx nx build api-server</verify>
      <done>
        - `GET /api/queues/dlq` returns filtered DLQ entries (all query params functional)
        - `GET /api/queues/dlq/stats` returns aggregate counts
        - `POST /api/queues/dlq/:taskId/retry` re-ingests task through pipeline
        - `POST /api/queues/dlq/:taskId/reroute` moves to specified queue
        - `DELETE /api/queues/dlq/:taskId` removes entry
        - Build passes
      </done>
    </task>

    <task id="4">
      <name>Add pipeline validation endpoint and rule set testing endpoint</name>
      <action>
        **Pipeline Validation** in `apps/api-server/src/app/pipelines/pipeline.controller.ts`:

        Add `POST /api/pipelines/:id/validate` endpoint:
        - Body: `PipelineValidationRequest` (sampleTask + optional includeRuleTrace)
        - Runs sample task through the full pipeline logic (dry-run — no data mutation):
          1. Validate task against pipeline's dataSchema
          2. Evaluate active rule sets scoped to this pipeline (using RuleEngineService)
          3. Evaluate routing rules to find target queue
          4. Return `PipelineValidationResult` with: valid, targetQueue, routingRuleMatched,
             ruleTrace (if requested), appliedRuleActions, errors[], warnings[]
        - Implement `validatePipeline(pipelineId, request)` in `PipelineService`

        **Rule Set Testing** in `apps/api-server/src/app/rules/rules.controller.ts`:

        Add `POST /api/rules/sets/:id/test` endpoint:
        - Body: `RuleSetTestRequest` (sampleTask)
        - Evaluates rule set against sample task without saving anything
        - Returns `RuleSetTestResponse`: taskBefore (original), taskAfter (post-rules),
          rulesEvaluated[] with matched + actionsApplied per rule, stoppedAt if stop_processing hit
        - Implement `testRuleSet(ruleSetId, sampleTask)` in `RuleEngineService`
      </action>
      <files>
        apps/api-server/src/app/pipelines/pipeline.controller.ts
        apps/api-server/src/app/pipelines/pipeline.service.ts
        apps/api-server/src/app/rules/rules.controller.ts
        apps/api-server/src/app/services/rule-engine.service.ts
      </files>
      <verify>npx nx build api-server</verify>
      <done>
        - `POST /api/pipelines/:id/validate` accepts `PipelineValidationRequest` and returns `PipelineValidationResult`
        - `POST /api/rules/sets/:id/test` accepts `RuleSetTestRequest` and returns `RuleSetTestResponse`
        - Both are dry-run (no data mutations)
        - Build passes
      </done>
    </task>

    <task id="5">
      <name>Add pipeline metrics service, versioning service, and status API</name>
      <action>
        **Create `apps/api-server/src/app/pipelines/pipeline-metrics.service.ts`:**
        ```typescript
        @Injectable()
        export class PipelineMetricsService {
          // Aggregates stats from QueueManagerService and TaskStoreService per pipeline
          getPipelineMetrics(pipelineId: string): PipelineMetrics
          getAllPipelineMetrics(): PipelineMetricsSummary
        }
        ```
        - `getPipelineMetrics(pipelineId)`: sum queue depths + DLQ counts for all queues in
          pipeline; calculate SLA compliance % from tasks within SLA deadline; derive error rate
          from DLQ / total ingested ratio. Use `QueueManagerService.getQueueHealth()` per queue.
        - `getAllPipelineMetrics()`: iterate all pipelines, call `getPipelineMetrics` for each.

        **Create `apps/api-server/src/app/pipelines/pipeline-version.service.ts`:**
        ```typescript
        @Injectable()
        export class PipelineVersionService {
          private versions = new Map&lt;string, PipelineVersion[]&gt;();

          snapshotPipeline(pipeline: Pipeline, changedBy: string, note: string): PipelineVersion
          getVersions(pipelineId: string): PipelineVersion[]
          rollback(pipelineId: string, versionId: string): Pipeline
        }
        ```
        - Call `snapshotPipeline()` in `PipelineService.updatePipeline()` after saving.
        - `rollback()` returns the snapshot Pipeline; caller (PipelineService) applies it.

        **Add API endpoints** in `pipeline.controller.ts`:
        - `GET /api/pipelines/metrics` — all pipeline metrics (calls `getAllPipelineMetrics()`)
        - `GET /api/pipelines/:id/metrics` — single pipeline metrics
        - `GET /api/pipelines/:id/versions` — version history (newest first, limit 20)
        - `POST /api/pipelines/:id/versions/:versionId/rollback` — restore snapshot

        **Register** `PipelineMetricsService` and `PipelineVersionService` in `pipelines.module.ts`.

        **WebSocket broadcast:** In `apps/api-server/src/app/gateway/agent.gateway.ts`, add a
        `@Interval(10000)` method `broadcastPipelineMetrics()` that calls
        `pipelineMetricsService.getAllPipelineMetrics()` and emits `pipeline:metrics` to all
        connected clients. Inject `PipelineMetricsService` into the gateway.
      </action>
      <files>
        apps/api-server/src/app/pipelines/pipeline-metrics.service.ts
        apps/api-server/src/app/pipelines/pipeline-version.service.ts
        apps/api-server/src/app/pipelines/pipeline.controller.ts
        apps/api-server/src/app/pipelines/pipeline.service.ts
        apps/api-server/src/app/pipelines/pipelines.module.ts
        apps/api-server/src/app/gateway/agent.gateway.ts
      </files>
      <verify>npx nx build api-server &amp;&amp; npx nx lint api-server</verify>
      <done>
        - `PipelineMetricsService` injectable with `getPipelineMetrics` and `getAllPipelineMetrics`
        - `PipelineVersionService` injectable with snapshot + rollback
        - `GET /api/pipelines/metrics` returns `PipelineMetricsSummary`
        - `GET /api/pipelines/:id/metrics` returns `PipelineMetrics`
        - `GET /api/pipelines/:id/versions` returns `PipelineVersion[]`
        - `POST /api/pipelines/:id/versions/:versionId/rollback` restores config
        - Gateway broadcasts `pipeline:metrics` every 10 seconds
        - Build and lint pass
      </done>
    </task>

    <task id="6">
      <name>Commit backend extensions</name>
      <action>
        Stage and commit all backend changes:
        ```
        feat(api): wire rule engine into orchestration, add DLQ API, validation, metrics, and versioning
        ```
        Commit should include:
        - Shared model additions (PipelineMetrics, PipelineVersion, RuleSetTestRequest/Response, etc.)
        - RuleEngineService wired into PipelineOrchestratorService
        - DlqController with filter/retry/reroute/discard endpoints
        - Pipeline validation dry-run endpoint
        - Rule set test endpoint
        - PipelineMetricsService + PipelineVersionService
        - Pipeline metrics + version history + rollback endpoints
        - Gateway pipeline:metrics broadcast
      </action>
      <files>ALL modified files above</files>
      <verify>npx nx build api-server &amp;&amp; npx nx build shared-models &amp;&amp; npx nx lint api-server</verify>
      <done>
        - `git log --oneline -1` shows the commit
        - All builds pass
        - No lint errors
      </done>
    </task>
  </tasks>

  <dependencies>None — this is Wave 1 and can start immediately.</dependencies>
</plan>
