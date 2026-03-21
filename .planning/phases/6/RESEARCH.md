# Phase 6 Research — Observability, Hardening & Storage Connectors

> Updated 2026-03-21 (re-plan after Wave 1 completion)

---

## Executive Summary

Wave 1 (Platform Hardening) is **100% complete** — 12 requirements across webhooks,
DLQ, queues, and event sourcing replay are all implemented. Waves 2 and 3 (Observability,
Storage Connectors, Portability) have not been started. Three plan files (2-1, 2-2, 3-1)
cover the remaining 15 requirements.

---

## Wave 1 — Already Implemented ✅

The following Phase 6 requirements were implemented in the previous session:

| Req ID | Feature | Status |
|--------|---------|--------|
| P6-001 | `@nestjs/throttler` webhook rate limiting (100 req/60s default) | ✅ |
| P6-002 | Per-endpoint `rateLimit` override on `WebhookEndpoint` model | ✅ |
| P6-003 | HTTP 429 with `Retry-After` header; `RATE_LIMITED` delivery log status | ✅ |
| P6-010 | `dlqAutoRetry` field on `PipelineQueue` model | ✅ |
| P6-011 | `DlqAutoRetryService` — `@Cron(EVERY_MINUTE)` scheduler with backoff | ✅ |
| P6-012 | `task.dlq.auto_retried` domain event emitted on each attempt | ✅ |
| P6-013 | Queue Config Panel — DLQ Auto-Retry section with conditional fields | ✅ |
| P6-020 | `GET /api/audit-log/replay/:aggregateId` endpoint | ✅ |
| P6-021 | Audit Log frontend replay UI with inline timeline | ✅ |
| P6-022 | `EventStoreService.replayAggregate()` state reducer | ✅ |
| P6-030 | `POST /api/queues/bulk` — activate/deactivate/pause with partial success | ✅ |
| P6-031 | Queue Monitor — checkbox selection + bulk action toolbar | ✅ |

**Files implementing Wave 1:**
- `apps/api-server/src/app/webhooks/webhooks.controller.ts` — throttler guard applied
- `apps/api-server/src/app/webhooks/webhooks.service.ts` — per-endpoint rate limit
- `apps/api-server/src/app/queues/dlq-auto-retry.service.ts` — scheduler service
- `apps/api-server/src/app/queues/queues.controller.ts` — bulk endpoint
- `apps/api-server/src/app/queues/queues.service.ts` — bulk logic
- `apps/api-server/src/app/services/event-store.service.ts` — replayAggregate()
- `apps/api-server/src/app/audit-log/audit-log.controller.ts` — replay endpoint
- `apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.ts` — replay UI
- `apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.ts` — bulk UI

---

## Wave 2 — Not Yet Implemented ❌

### Observability (P6-040 to P6-044)

**Missing files:**
- `grafana/nexus-queue-dashboard.json` — Grafana dashboard with 6 panels
- `prometheus/alerts.yml` — 4 Prometheus alerting rules
- `prometheus/prometheus.yml` — Prometheus scrape config
- `docker-compose.yml` monitoring profile — prometheus + grafana services (opt-in)

**Existing metrics infrastructure:**
- `apps/api-server/src/app/metrics/metrics.controller.ts` — existing metrics controller
  - `GET /api/metrics/overview` — agents + queues + tasks overview
  - `GET /api/metrics/agents` — per-agent performance
  - `GET /api/metrics/queues` — per-queue stats
  - `GET /api/metrics/dispositions` — disposition usage
  - `GET /api/metrics/health` — health check
  - **MISSING:** `GET /api/metrics/json` (MetricsSnapshot endpoint for frontend)
- `apps/api-server/src/app/metrics/metrics.module.ts` — imports `ServicesModule`
- No separate `MetricsService` — controller directly injects `AgentManagerService`,
  `QueuesService`, `DispositionService`, `TaskSourceService`
- **KEY PATH CORRECTION:** The old plan draft incorrectly references
  `apps/api-server/src/app/monitoring/metrics.controller.ts` —
  the actual path is `apps/api-server/src/app/metrics/metrics.controller.ts`

**Missing frontend:**
- `ObservabilityComponent` at `/admin/observability` — not yet created
- Admin sidebar link to Observability — not yet added
- Admin routes file: `apps/agent-workspace/src/app/features/admin/admin.routes.ts`

### Storage Connectors (P6-050 to P6-054)

**Current Volume Loader state:**
- `apps/api-server/src/app/volume-loader/volume-loader.service.ts` — existing service
- `apps/api-server/src/app/volume-loader/volume-loader.controller.ts` — existing controller
  - Has `POST :id/test` endpoint (basic health check, not connector-backed)
  - Does NOT have the `POST :id/test-connection` connector-backed endpoint (P6-054)
- Volume Loader supports types: LOCAL, HTTP, GCS, S3, SFTP (declared but stubs only)
- `apps/api-server/src/app/volume-loader/connectors/` — **DOES NOT EXIST**
- npm packages `@aws-sdk/client-s3`, `@google-cloud/storage`, `ssh2-sftp-client` — **NOT INSTALLED**

**Missing files:**
- `connectors/connector.interface.ts` — IStorageConnector + RemoteFile interfaces
- `connectors/local.connector.ts` — LocalConnectorService
- `connectors/http.connector.ts` — HttpConnectorService
- `connectors/s3.connector.ts` — S3ConnectorService
- `connectors/gcs.connector.ts` — GcsConnectorService
- `connectors/sftp.connector.ts` — SftpConnectorService
- `connectors/index.ts` — barrel export

**Frontend:**
- Volume Loader component exists; "Test Connection" button needs to be wired
  to the connector-backed `POST :id/test-connection` endpoint

---

## Wave 3 — Not Yet Implemented ❌

### Rule Set Portability (P6-060 to P6-062)

**Current rules infrastructure:**
- `apps/api-server/src/app/rules/rules.controller.ts` — has CRUD + test endpoints
  - `GET /api/rules/sets` — list all rule sets ✅
  - `POST /api/rules/sets/:id/test` — dry-run test ✅
  - **MISSING:** `GET /api/rules/sets/:id/export` ❌
  - **MISSING:** `POST /api/rules/sets/import` ❌
- `apps/api-server/src/app/services/rule-engine.service.ts` — rule engine
  - **MISSING:** `exportRuleSet()`, `importRuleSet()`, `validateRuleSetBundle()` ❌

**Shared models missing:**
- `RuleSetBundle`, `RuleSetImportResult`, `RuleSetImportError` not in `rule.interface.ts`

**Frontend:**
- `rule-builder.component.ts` — exists, no export/import UI
- `apps/agent-workspace/src/app/features/admin/services/rules.service.ts` —
  no `exportRuleSet()` / `importRuleSet()` methods

### Pipeline Version Diff (P6-063 to P6-064)

**Current pipeline versioning:**
- `apps/api-server/src/app/pipelines/pipeline-version.service.ts` — version history
  - Has: `saveVersion()`, `getVersions()`, `rollback()` ✅
  - **MISSING:** `getDiff()`, `diffObjects()` ❌
- `apps/api-server/src/app/pipelines/pipeline.controller.ts`
  - Has: `GET /:id/versions`, `POST /:id/versions/:versionId/rollback` ✅
  - **MISSING:** `GET /:id/versions/diff` ❌

**Shared models missing:**
- `VersionDiffEntry`, `VersionDiffResult` not in `pipeline.interface.ts`

**Frontend:**
- `pipelines.component.ts` — exists, no diff trigger
- `PipelineDiffModalComponent` — **DOES NOT EXIST**
- `apps/agent-workspace/src/app/features/admin/services/pipeline.service.ts` —
  no `getVersionDiff()` method

---

## Implementation Status Table

| Req | Description | Status |
|-----|-------------|--------|
| P6-001 | Webhook throttler | ✅ Wave 1 Done |
| P6-002 | Per-endpoint rate limit | ✅ Wave 1 Done |
| P6-003 | 429 + Retry-After + RATE_LIMITED log | ✅ Wave 1 Done |
| P6-010 | dlqAutoRetry model field | ✅ Wave 1 Done |
| P6-011 | DlqAutoRetryService scheduler | ✅ Wave 1 Done |
| P6-012 | task.dlq.auto_retried event | ✅ Wave 1 Done |
| P6-013 | Queue Config DLQ Auto-Retry UI | ✅ Wave 1 Done |
| P6-020 | Replay endpoint | ✅ Wave 1 Done |
| P6-021 | Replay UI | ✅ Wave 1 Done |
| P6-022 | replayAggregate() reducer | ✅ Wave 1 Done |
| P6-030 | POST /api/queues/bulk | ✅ Wave 1 Done |
| P6-031 | Queue Monitor bulk selection | ✅ Wave 1 Done |
| P6-040 | Grafana dashboard JSON | ❌ Wave 2 (2-1) |
| P6-041 | Prometheus alert rules | ❌ Wave 2 (2-1) |
| P6-042 | Monitoring Docker profile | ❌ Wave 2 (2-1) |
| P6-043 | GET /api/metrics/json | ❌ Wave 2 (2-1) |
| P6-044 | Admin Observability page | ❌ Wave 2 (2-1) |
| P6-050 | S3ConnectorService | ❌ Wave 2 (2-2) |
| P6-051 | GcsConnectorService | ❌ Wave 2 (2-2) |
| P6-052 | SftpConnectorService | ❌ Wave 2 (2-2) |
| P6-053 | IStorageConnector abstraction | ❌ Wave 2 (2-2) |
| P6-054 | Test Connection endpoint + UI | ❌ Wave 2 (2-2) |
| P6-060 | Rule set export endpoint | ❌ Wave 3 (3-1) |
| P6-061 | Rule set import endpoint | ❌ Wave 3 (3-1) |
| P6-062 | Rule Builder export/import UI | ❌ Wave 3 (3-1) |
| P6-063 | Pipeline version diff endpoint | ❌ Wave 3 (3-1) |
| P6-064 | PipelineDiffModalComponent | ❌ Wave 3 (3-1) |

**Total:** 12/27 complete, 15 remaining across Wave 2 (10) and Wave 3 (5).

---

## Existing Patterns to Follow

### Angular Patterns (from Phase 5 components)
- Standalone components with `ChangeDetectionStrategy.OnPush`
- Signals (`signal<T>()`) for local component state
- `takeUntil(this.destroy$)` for subscription cleanup
- `inject()` for dependency injection (not constructor)
- `PageLayoutComponent` wrapper for admin pages

### NestJS Patterns
- `@Public()` decorator for unauthenticated endpoints
- Feature module organization (connector services registered in `VolumeLoaderModule`)
- `@Header()` decorator for file download responses
- Route ordering: specific routes before parameterised routes
  (e.g., `sets/import` before `sets/:id`, `versions/diff` before `versions/:versionId/rollback`)

### Test Patterns (Vitest)
- Co-located `.spec.ts` files
- `TestBed.configureTestingModule()` with `provideHttpClientTesting()`

---

## Tech Debt

### Current Baseline

| Project | Error Count | Status |
|---------|-------------|--------|
| `agent-workspace` | **0** | ✅ Fully cleared (Phase 4 Wave 3) |
| `api-server` | **0** | ✅ Fully cleared (Phase 4 Wave 1) |

### Tech Debt Audit Result

Both projects have **zero pre-existing lint errors**. Per policy, the Wave 1 debt
reduction task is **skipped** for Phase 6 — there is no debt to reduce.

> Policy: "If both projects have zero errors, skip the debt task."

### Non-Regression Requirement

New code introduced in Phase 6 must not increase either project's error count above 0.
Each plan's verify steps include lint commands to enforce this.

---

*Last Updated: 2026-03-21*
