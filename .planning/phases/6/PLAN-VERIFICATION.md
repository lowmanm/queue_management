# Phase 6 Plan Verification

> Updated: 2026-03-21 (re-plan; Wave 1 complete, Waves 2–3 verified for remaining work)

---

## Requirement Coverage

| P6 Requirement ID | Description | Plan |
|---|---|---|
| P6-001 | @nestjs/throttler; webhook rate limiting (100 req/60s, configurable) | 1-1 Task 1 ✅ DONE |
| P6-002 | Per-endpoint rateLimit field in WebhookEndpoint model | 1-1 Task 1 ✅ DONE |
| P6-003 | 429 with Retry-After; RATE_LIMITED delivery log entry | 1-1 Task 1 ✅ DONE |
| P6-010 | dlqAutoRetry field in PipelineQueue model | 1-1 Task 2 ✅ DONE |
| P6-011 | DlqAutoRetryService with @Cron(EVERY_MINUTE); re-ingests via PipelineOrchestratorService | 1-1 Task 2 ✅ DONE |
| P6-012 | task.dlq.auto_retried event emitted per auto-retry | 1-1 Task 2 ✅ DONE |
| P6-013 | Queue Config Panel — DLQ Auto-Retry section with enable/interval/maxRetries/backoffMultiplier | 1-1 Task 4 ✅ DONE |
| P6-020 | GET /api/audit-log/replay/:aggregateId returns events + reconstructedState | 1-1 Task 3 ✅ DONE |
| P6-021 | Audit Log frontend — Replay Task action with step-by-step timeline modal | 1-1 Task 5 ✅ DONE |
| P6-022 | EventStoreService.replayAggregate(); read-only, no live state modification | 1-1 Task 3 ✅ DONE |
| P6-030 | POST /api/queues/bulk with activate/deactivate/pause actions | 1-1 Task 3 ✅ DONE |
| P6-031 | Queue Monitor — checkbox selection + bulk action toolbar | 1-1 Task 4 ✅ DONE |
| P6-040 | grafana/nexus-queue-dashboard.json — 6-panel importable dashboard | 2-1 Task 1 |
| P6-041 | prometheus/alerts.yml — 4 alerting rules | 2-1 Task 1 |
| P6-042 | docker-compose.yml monitoring profile (prometheus + grafana) | 2-1 Task 2 |
| P6-043 | GET /api/metrics/json — MetricsSnapshot JSON endpoint (public) | 2-1 Task 3 |
| P6-044 | /admin/observability page — live metric tiles (designerGuard) | 2-1 Task 4 |
| P6-050 | S3ConnectorService via @aws-sdk/client-s3 | 2-2 Task 2 |
| P6-051 | GcsConnectorService via @google-cloud/storage | 2-2 Task 3 |
| P6-052 | SftpConnectorService via ssh2-sftp-client | 2-2 Task 3 |
| P6-053 | IStorageConnector abstraction; VolumeLoaderService routes to connectors | 2-2 Tasks 1, 4 |
| P6-054 | POST /api/volume-loaders/:id/test-connection + Volume Loader UI button | 2-2 Tasks 4, 5 |
| P6-060 | GET /api/rules/sets/:id/export — RuleSetBundle with attachment header | 3-1 Task 1 |
| P6-061 | POST /api/rules/sets/import — validates + creates new rule set with new UUIDs | 3-1 Task 1 |
| P6-062 | Rule Builder — Export JSON + Import JSON UI | 3-1 Task 2 |
| P6-063 | GET /api/pipelines/:id/versions/diff?v1&v2 — VersionDiffResult | 3-1 Task 3 |
| P6-064 | PipelineDiffModalComponent — version selector + color-coded diff table | 3-1 Task 4 |

**Coverage: 27/27 requirements covered (100%)**

---

## Plan Dependency Check

```
Wave 1: 1-1-platform-hardening
  ↓
Wave 2: 2-1-observability-alerting  (parallel)
Wave 2: 2-2-storage-connectors       (parallel)
  ↓
Wave 3: 3-1-portability-completions
```

- ✅ No circular dependencies
- ✅ Wave 1 has no predecessors
- ✅ Wave 2 plans are independent of each other
- ✅ Wave 3 depends only on Wave 1 (no code dep on Wave 2, but logically follows)

---

## File Conflict Check

Files modified by multiple plans:

| File | Plans | Conflict? |
|---|---|---|
| `libs/shared-models/src/lib/pipeline.interface.ts` | 1-1 (dlqAutoRetry), 3-1 (VersionDiffResult) | ✅ No conflict — different fields, Wave 3 is after Wave 1 |
| `libs/shared-models/src/lib/index.ts` | 2-1 (metrics), 3-1 (rule/pipeline types) | ✅ No conflict — different exports, Wave 3 is after Wave 2 |
| `package.json` | 1-1 (throttler), 2-2 (AWS/GCS/SFTP SDKs) | ✅ No conflict — different packages, Wave 2 is after Wave 1 |
| `apps/agent-workspace/src/app/shared/components/layout/app-shell.component.*` | 2-1 (observability nav link) | ✅ Single plan modifies these files |

No unresolvable file conflicts between plans.

---

## Convention Compliance Check

### Angular Frontend
- ✅ All new components are standalone (no NgModules)
- ✅ `ChangeDetectionStrategy.OnPush` specified in all new components
- ✅ `signal()` used for component state (no plain properties)
- ✅ `takeUntil(this.destroy$)` pattern for RxJS subscriptions
- ✅ Services use `inject()` (not constructor injection) — consistent with codebase pattern
- ✅ Import order: Angular core → RxJS → @nexus-queue/* → local
- ✅ File naming: `kebab-case.component.ts`

### NestJS Backend
- ✅ Feature-based module organization (connectors in volume-loader, DLQ service in queues)
- ✅ Thin controllers — business logic in services
- ✅ Injectable services with single responsibility
- ✅ Route ordering verified for ambiguity (import before :id, diff before rollback)

### TypeScript
- ✅ Strict mode — no `any` types in plan specifications
- ✅ Interfaces for all data structures
- ✅ `unknown` used for diffObject values (type-safe)

### Shared Models
- ✅ All new types (`RuleSetBundle`, `VersionDiffResult`, `MetricsSnapshot`) in shared-models
- ✅ All exported from `index.ts`

### Commits
- ✅ `feat(scope): description (P6-xxx)` format per task

---

## Path Corrections Applied

The 2-1-observability-alerting-PLAN.md previously referenced an incorrect path
`apps/api-server/src/app/monitoring/` — corrected to `apps/api-server/src/app/metrics/`.
Also: no separate `MetricsService` exists; `MetricsController` directly injects services.
Task 3 updated to reflect this (aggregate from injected services, not prom-client getter).

---

## Tech Debt Non-Regression

Both projects at 0 errors entering Phase 6.

- `agent-workspace`: 0 → must remain ≤ 0 after each plan
- `api-server`: 0 → must remain ≤ 0 after each plan

No debt reduction task needed (both at zero). Documented in RESEARCH.md §Tech Debt.

---

## Verification Summary

- [x] Every v1 requirement maps to at least one plan task
- [x] Every plan has clear verification criteria (`<verify>` and `<done>`)
- [x] No circular dependencies between plans
- [x] File lists have no unresolvable conflicts between plans
- [x] Plans follow project conventions
- [x] Wave 1 debt task: EXEMPT (both projects at 0 errors — documented)
- [x] All 4 plans are vertical slices (full feature from model → API → UI)
- [x] Total tasks: 18 across 4 plans (avg 4.5 tasks/plan — within target range)
