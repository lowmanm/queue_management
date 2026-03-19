## Execution Summary: 1-1-backend-extensions-PLAN.md

**Status:** Complete
**Tasks:** 5/5 (+ 1 lint fix commit)
**Commits:**
- `84d5f73` feat(models): add Phase 3 metrics, validation, versioning, and rule test types
- `eeb71d7` feat(api): add pipeline-scoped rule set filtering to RuleEngineService
- `e9943fc` feat(api): add DLQ controller with filter, retry, reroute, and discard endpoints
- `66fb039` feat(api): add pipeline validation and rule set testing endpoints
- `bce19bc` feat(api): add pipeline metrics service, versioning service, and status API endpoints
- `78fb414` fix(api): fix no-case-declarations and prefer-const lint errors

### What Was Built

- **Phase 3 shared model types**: `PipelineMetrics`, `PipelineMetricsSummary`, `PipelineValidationRequest`, `PipelineValidationResult`, `PipelineVersion`, `RuleSetTestRequest`, `RuleSetTestResponse`, `pipelineIds` in `RuleSet.appliesTo`
- **Pipeline-scoped rule sets**: `RuleEngineService.getRuleSetsForPipeline(pipelineId)` filters enabled rule sets by pipeline scope
- **Rule set testing endpoint**: `POST /api/rules/sets/:id/test` returns before/after task state and rule trace
- **DLQ API**: Full CRUD over dead-letter queue — `GET /api/queues/dlq` (filtered), `GET /api/queues/dlq/stats`, `POST /api/queues/dlq/:taskId/retry`, `POST /api/queues/dlq/:taskId/reroute`, `DELETE /api/queues/dlq/:taskId`
- **Pipeline dry-run validation**: `POST /api/pipelines/:id/validate` evaluates routing rules against a sample task without mutating state
- **Pipeline versioning**: Auto-snapshot on every `updatePipeline()` call; `GET /api/pipelines/:id/versions`, `POST /api/pipelines/:id/versions/:versionId/rollback`
- **Pipeline metrics**: Aggregate queue depths, DLQ counts, SLA compliance per pipeline; `GET /api/pipelines/metrics`, `GET /api/pipelines/:id/metrics`
- **Real-time metrics broadcast**: `pipeline:metrics` WebSocket event emitted every 10 seconds via `AgentGateway`

### Files Created

- `apps/api-server/src/app/queues/dlq.controller.ts`
- `apps/api-server/src/app/pipelines/pipeline-version.service.ts`
- `apps/api-server/src/app/services/pipeline-metrics.service.ts`

### Files Modified

- `libs/shared-models/src/lib/pipeline.interface.ts` — Phase 3 types
- `libs/shared-models/src/lib/rule.interface.ts` — `pipelineIds`, test request/response types
- `apps/api-server/src/app/services/rule-engine.service.ts` — `testRuleSet()`, `getRuleSetsForPipeline()`, `applyActions()` public
- `apps/api-server/src/app/services/queue-manager.service.ts` — `getDlqStats()`
- `apps/api-server/src/app/queues/queues.module.ts` — `DlqController` registered
- `apps/api-server/src/app/pipelines/pipeline.service.ts` — `validatePipelineConfig()`, `rollbackPipeline()`, auto-snapshot on update
- `apps/api-server/src/app/pipelines/pipeline.controller.ts` — 5 new endpoints
- `apps/api-server/src/app/pipelines/pipeline.module.ts` — `PipelineVersionService` added
- `apps/api-server/src/app/services/services.module.ts` — `PipelineMetricsService` added
- `apps/api-server/src/app/services/index.ts` — barrel export
- `apps/api-server/src/app/rules/rules.controller.ts` — `POST /rules/sets/:id/test`
- `apps/api-server/src/app/gateway/agent.gateway.ts` — metrics broadcast, `PipelineMetricsService` injected

### Issues Encountered

1. **`RuleEngineService` already wired**: Research said it wasn't wired into `PipelineOrchestratorService`, but it already was. Task 2 was re-scoped to add pipeline-scoped filtering instead.
2. **`applyActions` was private**: Changed to public to support `testRuleSet()`. Variable `let modified` also changed to `const`.
3. **Route ordering**: `GET /queues/dlq` would be swallowed by `GET /queues/:id`. Fixed by ensuring `DlqController` is in `QueuesModule` which is registered before `PipelineModule`.
4. **`GET /pipelines/metrics` route conflict**: Declared `@Get('metrics')` before `@Get(':id')` in the controller to prevent "metrics" being treated as an id.
5. **Lint target**: `npx nx lint api-server` fails — correct command is `npx nx run api-server:eslint:lint`.
6. **Pre-existing lint errors**: `routing.service.ts` and `tasks.service.ts` had pre-existing `no-case-declarations`/`prefer-const` errors not introduced by this work.
