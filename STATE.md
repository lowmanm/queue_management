# Nexus Queue — Session State

> **Read this first when returning to the project.**
> This file captures current position, active decisions, blockers, and session context.

---

## Current Position

| Field | Value |
|---|---|
| **Active Phase** | Phase 3 — Logic Builder |
| **Phase Status** | In Progress — Wave 2 all plans complete, run `/verify-phase 3` next |
| **Last Session** | 2026-03-19 |
| **Next Action** | `/verify-phase 3` |

---

## What Just Happened (Session: 2026-03-19)

### Phase 3 Wave 1 — Backend Extensions Complete

All backend services and APIs required for Phase 3 are implemented and merged to `develop`.

**Plan executed:** `.planning/phases/3/1-1-backend-extensions-PLAN.md`
**Summary:** `.planning/phases/3/1-1-backend-extensions-PLAN-SUMMARY.md`

### Decisions Made

1. **Phase 3 Wave 1 scoped to backend-only** — All new API endpoints and services needed by the Wave 2 frontend plans are implemented. Frontend work (wizard, rule builder, DLQ monitor, pipeline dashboard) is Wave 2.

2. **`RuleEngineService` was already wired** — Research said it wasn't connected to `PipelineOrchestratorService` but it was already calling `this.ruleEngine.evaluateTask(task)`. Wave 1 Task 2 was re-scoped to add pipeline-scoped rule set filtering instead.

3. **`PipelineMetricsService` placed in `ServicesModule`** — Avoids a new circular dependency; `ServicesModule` already has `forwardRef(() => PipelineModule)`.

4. **`@Optional()` injection pattern** — Used for `PipelineVersionService` in `PipelineService` and `PipelineMetricsService` in `PipelineController` to allow graceful degradation if services are unavailable at construction time.

5. **`setInterval` instead of `@nestjs/schedule`** — Gateway uses `setInterval` in `afterInit()` to broadcast pipeline metrics every 10s rather than pulling in a new dependency.

### New Backend Capabilities

| Endpoint | Purpose |
|---|---|
| `GET /api/queues/dlq` | List DLQ tasks with filters (pipeline, queue, reason, date range) |
| `GET /api/queues/dlq/stats` | DLQ counts grouped by reason/queue/pipeline |
| `POST /api/queues/dlq/:taskId/retry` | Retry failed task through orchestrator |
| `POST /api/queues/dlq/:taskId/reroute` | Move DLQ task to a different queue |
| `DELETE /api/queues/dlq/:taskId` | Discard a DLQ task |
| `POST /api/rules/sets/:id/test` | Test rule set against sample task (before/after trace) |
| `POST /api/pipelines/:id/validate` | Dry-run pipeline config against sample task |
| `GET /api/pipelines/metrics` | Aggregate metrics for all pipelines |
| `GET /api/pipelines/:id/metrics` | Metrics for a single pipeline |
| `GET /api/pipelines/:id/versions` | Version history (newest first, max 20) |
| `POST /api/pipelines/:id/versions/:versionId/rollback` | Restore a prior config snapshot |

### New Services

| Service | Location |
|---|---|
| `PipelineMetricsService` | `apps/api-server/src/app/services/` |
| `PipelineVersionService` | `apps/api-server/src/app/pipelines/` |

### WebSocket

- `pipeline:metrics` event broadcast every 10s from `AgentGateway` (payload: `PipelineMetricsSummary`)

### New Shared Model Types

`PipelineMetrics`, `PipelineMetricsSummary`, `PipelineValidationRequest`, `PipelineValidationResult`, `PipelineVersion`, `RuleSetTestRequest`, `RuleSetTestResponse`, `pipelineIds` in `RuleSet.appliesTo`

---

## Phase 3 Progress

| Wave | Plan | Status |
|---|---|---|
| Wave 1 | `1-1-backend-extensions-PLAN.md` | ✅ Complete (merged to develop) |
| Wave 2 | `2-1-pipeline-wizard-queue-config-PLAN.md` | ✅ Complete |
| Wave 2 | `2-2-rule-builder-ui-PLAN.md` | ✅ Complete |
| Wave 2 | `2-3-dlq-monitor-pipeline-status-PLAN.md` | ✅ Complete |

Wave 2 plans are independent of each other and can be executed in any order.
Recommended order: `2-1` → `2-2` → `2-3` (wizard first, then rule builder, then monitor/dashboard)

---

## Active Decisions & Context

| Decision | Rationale |
|---|---|
| Form-based rule builder (not visual drag-and-drop flow) | Faster to build, sufficient for v1. Visual flow builder is Phase 5+ |
| Pipeline wizard is multi-step (not single-page form) | Complex config benefits from guided steps; each step validates before next |
| DLQ monitor is Manager/Admin only | Agents shouldn't manage failed tasks; Designers shouldn't need to |
| In-memory stores continue for Phase 3 | Persistence is Phase 4; Phase 3 adds config UIs on top of existing services |
| Config versioning is backend-only in Phase 3 | No diff UI until Phase 4; just track changes for rollback |
| `npx nx lint api-server` target is `eslint:lint` | Run as `npx nx run api-server:eslint:lint`; the short `lint` alias does not exist for api-server |

---

## Blockers

None currently.

---

## Project Health

| Metric | Status |
|---|---|
| Build | ✅ Passing (`nx build agent-workspace`, `nx build api-server`) |
| Lint | ⚠️ `agent-workspace` passes. `api-server` has 8 pre-existing errors in `routing.service.ts` and `tasks.service.ts` (not introduced by Phase 3 work) |
| Tests | ✅ Passing |
| Tech Debt | Low — clean separation between frontend features and backend services |

---

## How to Use This File

1. **Returning to project** → Read "Current Position" and "Next Action"
2. **Starting a session** → Run `/status` to get a formatted summary
3. **Ending a session** → Run `/update-state` to capture decisions and progress
4. **Context too stale** → Check ROADMAP.md for phase status, REQUIREMENTS.md for scope

---

*Last Updated: 2026-03-19 (Phase 3 Wave 1 complete)*
