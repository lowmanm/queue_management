# Phase 3 Research — Logic Builder

> Technical investigation of existing codebase to inform Phase 3 planning.
> Produced by: `/plan-phase 3` on 2026-03-19.

---

## 1. Existing Backend APIs

### Pipeline API (`/api/pipelines`) — ✅ Mature
**Controller:** `apps/api-server/src/app/pipelines/pipeline.controller.ts`
**Service:** `apps/api-server/src/app/pipelines/pipeline.service.ts` (also `PipelineService` in `services/`)

Key endpoints already implemented:
- Full pipeline CRUD (GET, POST, PUT, DELETE)
- Nested queue management (`/pipelines/:id/queues/*`)
- Nested routing rule management (`/pipelines/:id/routing-rules/*`)
- Agent access control (`/pipelines/:id/agents/*`)
- Pipeline enable/disable toggle
- Pre-delete impact analysis (`/pipelines/:id/delete-impact`)
- Summary view for dashboard (`?summary=true`)
- Detail view with queues + rules (`?details=true`)

**Gaps for Phase 3:**
- No validation/dry-run endpoint
- No pipeline config versioning
- No pipeline metrics endpoint

### Rules API (`/api/rules`) — ✅ Functional, gaps exist
**Controller:** `apps/api-server/src/app/rules/rules.controller.ts`
**Service:** `apps/api-server/src/app/services/rule-engine.service.ts`

Key endpoints already implemented:
- Rule set CRUD (`/rules/sets/*`)
- Config endpoints: fields, actions, operators
- 15 operators, 9 action types, 16 predefined fields

**Critical gap:** RuleEngineService is NOT wired into PipelineOrchestratorService.
Rules are stored and retrievable but never executed in the task flow.

**Gaps for Phase 3:**
- No rule set testing endpoint (before/after task preview)
- Fields are hardcoded (not schema-aware from pipeline definition)
- No integration with orchestration pipeline

### Queues API (`/api/queues`) — ⚠️ Legacy
**Controller:** `apps/api-server/src/app/queues/queues.controller.ts`
**Note:** Being superseded by `/api/pipelines/:id/queues`. Still active for backward compatibility.

Real-time queue stats are available via `GET /queues/stats` and `GET /queues/:id/stats`.

**Gaps for Phase 3:**
- No DLQ endpoint (data exists in `QueueManagerService.getDLQTasks()` but not exposed)
- No DLQ actions (retry, discard, reroute)

### Routing API (`/api/routing`) — ✅ Advanced
**Controller:** `apps/api-server/src/app/routing/routing.controller.ts`
**Service:** `apps/api-server/src/app/routing/routing.service.ts`

Fully functional skill management, agent-skill assignment, routing strategies, and scoring algorithms. No major Phase 3 gaps here.

---

## 2. Core Service Wiring Analysis

### PipelineOrchestratorService
**File:** `apps/api-server/src/app/services/pipeline-orchestrator.service.ts`

Current flow:
```
ingestTask(task, pipelineId)
  → validateTask()
  → routeTask()           ← should call RuleEngineService here before routing
  → enqueue(queuedTask)
  → [on failure] moveToDLQ()
```

**Missing link:** `RuleEngineService.evaluateTask()` is never called. Phase 3 must wire
rules into the orchestration flow between validation and routing.

### QueueManagerService
**File:** `apps/api-server/src/app/services/queue-manager.service.ts`

DLQ is fully implemented internally:
- `moveToDLQ(queuedTask, reason)` — stores in per-queue DLQ map
- `removeFromDLQ(taskId)` — retrieves and removes
- `getDLQTasks(queueId?)` — lists all or filtered by queue

Failure reasons currently used: `max_retries_exceeded`, `sla_expired`, `routing_failed`

No HTTP API exposes this data — **DLQ controller is a Phase 3 deliverable**.

---

## 3. Frontend Admin Components

### PipelinesComponent — ✅ Comprehensive, needs wizard
**File:** `apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.ts`

Already handles:
- Pipeline list view + detail view (tabbed: queues, rules)
- Inline editors for pipeline (name, description, workTypes)
- Inline editors for queues (name, priority, skills, capacity)
- Routing rule editor (conditions with field/operator/value + target queue)
- Schema-aware field filtering in routing conditions (uses pipeline.dataSchema)

**Phase 3 enhancement:** Replace inline pipeline creation with multi-step wizard.
The existing editor is sufficient for editing; the wizard covers creation only.

### PipelineApiService — ✅ Complete
**File:** `apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts`

25 methods covering all pipeline/queue/routing/agent operations.
Phase 3 adds: `validatePipeline()`, `getPipelineMetrics()`, `getPipelineVersions()`,
`rollbackPipelineVersion()`.

### RulesService — ✅ Functional wrapper
**File:** `apps/agent-workspace/src/app/features/admin/services/rules.service.ts`

Wraps Rules API with BehaviorSubject caching for fields, actions, operators, and rule sets.
Phase 3 adds: `testRuleSet()` method.

**No RuleBuilder UI component exists yet.** The service is ready; the component is a Phase 3 deliverable.

---

## 4. Shared Models

### pipeline.interface.ts — ✅ Comprehensive
Already defines: `Pipeline`, `PipelineQueue`, `RoutingRule`, `RoutingCondition`,
`DefaultRoutingConfig`, `PipelineSLA`, `PipelineDataSchema`, `PipelineFieldDefinition`,
`PipelineSummary`, `PipelineWithDetails`, all request/response types.

**Missing for Phase 3:**
- `PipelineMetrics` (throughput, error rate, SLA compliance per pipeline)
- `PipelineVersion` (config snapshot with timestamp and author)
- `PipelineValidationRequest/Response` (dry-run result with routing trace)

### rule.interface.ts — ✅ Comprehensive
Already defines: `RuleSet`, `Rule`, `ConditionGroup`, `RuleCondition`, `RuleAction`,
`RuleEvaluationResult`, `RuleSetEvaluationResult`.

**Missing for Phase 3:**
- `RuleSetTestRequest` (sample task + rule set ID)
- `RuleSetTestResponse` (before/after task state + which rules fired)

---

## 5. Dead Letter Queue Analysis

**DLQ is fully implemented on the backend** in `QueueManagerService`:
- Stored per-queue in a `Map<queueId, DLQEntry[]>`
- `DLQEntry = { queuedTask, reason, movedAt }`
- `getDLQTasks(queueId?)` aggregates across all queues or filters by queue

**Phase 3 needs:**
1. `DlqController` exposing: list (with filter), retry, reroute, discard endpoints
2. `DlqMonitorComponent` in frontend for Manager/Admin (not Designer)
3. Enhanced `DLQEntry` type in shared models (add `retryCount`, `pipelineId`, `pipelineName`)

---

## 6. Testing Patterns

Only one test file found: `apps/agent-workspace/src/app/app.spec.ts` (Angular TestBed).

Backend tests would use Vitest (per CLAUDE.md stack). Co-located `.spec.ts` files.

**Phase 3 test targets:**
- `pipeline-orchestrator.service.spec.ts` — rule engine wiring
- `dlq.controller.spec.ts` — DLQ endpoint behavior
- `pipeline-metrics.service.spec.ts` — metrics aggregation
- `rule-builder.component.spec.ts` — component rendering

---

## 7. Routing and Navigation

Current admin routes (in admin routing module):
- `/admin/volume-loaders`
- `/admin/pipelines`
- `/admin/skills`
- `/admin/dispositions`
- `/admin/work-states`
- `/admin/users`

**Phase 3 adds:**
- `/admin/pipelines/new` → PipelineWizardComponent (routed, full-page)
- `/admin/rule-sets` → RuleBuilderComponent (new admin route)
- `/manager/dlq` → DlqMonitorComponent (Manager/Admin only)
- `/manager/pipeline-status` → PipelineStatusDashboardComponent

---

## 8. WebSocket Events (Pipeline Status)

Current gateway events are agent/task-centric. Phase 3 adds pipeline-level events:

| Direction | Event | Payload |
|-----------|-------|---------|
| Server → Client | `pipeline:metrics` | `{ pipelineId, metrics: PipelineMetrics }` |
| Server → Client | `pipeline:status-changed` | `{ pipelineId, status, reason }` |

AgentGateway already broadcasts on connection; same pattern for periodic metrics broadcast.

---

## 9. Summary of Gaps

| Gap | Plan | Priority |
|-----|------|----------|
| Wire RuleEngineService into orchestration | 1-1 | Critical |
| DLQ controller + endpoints | 1-1 | High |
| Pipeline validation endpoint | 1-1 | High |
| Rule set testing endpoint | 1-1 | High |
| Pipeline metrics service + API | 1-1 | High |
| Configuration versioning | 1-1 | Medium |
| Pipeline creation wizard (6 steps) | 2-1 | High |
| Queue configuration panel | 2-1 | High |
| Enhanced routing rule editor | 2-1 | High |
| Rule Builder UI component | 2-2 | High |
| Rule ordering (up/down controls) | 2-2 | Medium |
| Rule set testing UI | 2-2 | High |
| DLQ Monitor component | 2-3 | High |
| Pipeline Status Dashboard | 2-3 | High |
| WebSocket pipeline metrics events | 2-3 | Medium |
