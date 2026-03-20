# Phase 5 — Research

> Investigation conducted: 2026-03-20
> Phase theme: External Integrations & Advanced Routing

---

## 1. What Phase 4 Left Us

All Phases 1–4 are shipped. Current system state:

| Layer | Status |
|---|---|
| Build | ✅ Passing |
| Lint | ✅ 0 errors (both projects) |
| Tests | ✅ 65 tests passing |
| Persistence | TypeORM (SQLite dev / PostgreSQL prod) + Redis write-through |
| Auth | JWT (bcrypt, 15m/7d TTL), global JwtAuthGuard with @Public() opt-out |
| Observability | Prometheus metrics at `/api/metrics`, health check at `/api/health` |
| Deployment | Multi-stage Dockerfiles + docker-compose.yml |

---

## 2. Deferred Items Targeting Phase 5

The following items were explicitly deferred to Phase 5 across ROADMAP.md and REQUIREMENTS.md:

| Item | Origin | Notes |
|---|---|---|
| Source system integrations (CRM, ACD) | Phase 4 Out of Scope | "Nexus doesn't own work records; source system adapters are Phase 5" |
| Cross-pipeline task routing | Phase 3 Out of Scope + Phase 4 Out of Scope | "Single-pipeline routing is sufficient for v1; deferred from Phase 3 → Phase 4+" |
| OAuth2/OIDC external provider | Phase 4 Out of Scope | "Internal JWT auth sufficient for v1 → Phase 5" |
| Visual drag-and-drop flow builder | Phase 3 Out of Scope | "Form-based UI sufficient; visual flow builder is Phase 5+ if needed" |
| Pipeline cloning (P3-100) | Phase 3 v2 deferred | Saves designer time |
| Rule set import/export as JSON (P3-101) | Phase 3 v2 deferred | Enables sharing/backup |

**Scoping Decision:** OAuth2/OIDC and visual drag-and-drop are large architectural investments that don't directly serve the core queue-management value proposition. Phase 5 will focus on the three highest-ROI items: external system integration (webhook ingestion + outbound callbacks), cross-pipeline routing, and pipeline portability. This gives Operations teams the wiring they need to connect Nexus to real source systems while Designers gain the flexibility to replicate and export configurations.

---

## 3. Key Findings from Codebase Exploration

### 3.1 Volume Loader HTTP/API Source Stubs

`VolumeLoaderService` has a `triggerRun()` method that processes LOCAL CSV files but simulates GCS/S3/SFTP/HTTP connectors. No real HTTP polling adapter exists. The `VolumeLoaderConfig` types include `HttpSourceConfig` with `url`, `method`, `headers`, and `pagination` fields — the schema is ready but the implementation returns mock data.

**Gap:** Real external sources cannot push tasks to Nexus. The only live ingestion path today is CSV upload via Volume Loader.

### 3.2 PipelineOrchestratorService — Ingestion Entry Point

`pipeline-orchestrator.service.ts` is the canonical entry point for all tasks. It validates, transforms, routes, and enqueues in a 6-step flow. The `TaskIngestionInput` accepts `source: 'volume_loader' | 'csv_upload' | 'api' | 'manual'` — `'api'` is already a valid source type, meaning an HTTP webhook endpoint can call `ingestTask()` directly.

**Opportunity:** A `WebhooksController` with `POST /api/webhooks/:token` is a thin layer over `ingestTask()`.

### 3.3 Cross-Pipeline Routing — Data Model Gap

`RoutingRule` in `pipeline.interface.ts`:
```typescript
interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  conditions: RoutingCondition[];
  targetQueueId: string;
  isDefault?: boolean;
}
```

There is no `targetPipelineId` field. All routing today is intra-pipeline (conditions → queue within same pipeline). Adding `targetPipelineId?: string` to `RoutingRule` enables cross-pipeline re-ingestion.

**Safety concern:** Cross-pipeline routing creates cycle risk. The `PipelineOrchestratorService` must track pipeline hops (max 3) to prevent infinite loops.

### 3.4 Outbound Webhooks — No Infrastructure Exists

There is no service today that sends HTTP POST events to external systems on task lifecycle events. `EventStoreService` appends events, but nothing fans them out externally. `Pipeline` interface has no `callbackUrl` or `callbackEvents` fields.

**Opportunity:** An `OutboundWebhookService` subscribes to EventStoreService events and POSTs to configured URLs per pipeline. HMAC-SHA256 signing (same pattern as inbound) is standard practice.

### 3.5 Pipeline Portability — No Export/Import/Clone

The `PipelineService` in `apps/api-server/src/app/pipelines/pipeline.service.ts` supports CRUD but has no export/import/clone operations. `PipelineOrchestratorService` creates tasks through pipelines but does not serialize config.

**P3-100 (clone) and P3-101 (import/export JSON)** are both unimplemented deferred v2 requirements. Phase 5 will promote both to v1.

### 3.6 Webhook Config UI — No Admin Component Exists

`apps/agent-workspace/src/app/features/admin/components/` contains: volume-loader, pipelines, skills, dispositions, work-states, users, audit-log. There is no `webhooks/` subdirectory.

**Gap:** No UI for Designers to view, create, or manage webhook endpoints.

### 3.7 App Shell Sidebar — Extensible Pattern

`app-shell.component.ts` reads navigation items from a `navItems` array structured by role. Adding a new `/admin/webhooks` route requires:
1. Adding a route to `app.routes.ts` with `designerGuard`
2. Adding a nav item to the sidebar under the "Configuration" functional area

The pattern is established and straightforward.

### 3.8 Existing Test Patterns

- Component tests: `TestBed` + mock services via `useValue`, signals tested via `component.signal()`
- Service tests: inject real service + mock dependencies
- Spec files co-located with source (same directory)
- Vitest 4.x with `vitest-angular` runner

---

## 4. Architecture for Phase 5

### 4.1 Webhook Ingestion Flow

```
External System
     │
     │ POST /api/webhooks/{token}
     │ Headers: X-Nexus-Signature: sha256={hmac}
     │ Body: { field1: ..., field2: ... }
     ▼
WebhooksController
     │ 1. Look up WebhookEndpoint by token
     │ 2. Verify HMAC signature
     │ 3. Check endpoint is active
     ▼
WebhooksService
     │ 4. Build TaskIngestionInput (source: 'api')
     │ 5. Log delivery attempt
     ▼
PipelineOrchestratorService.ingestTask()
     │ 6. Normal validate → transform → route → enqueue flow
     ▼
     Result (QUEUED | DLQ | REJECTED)
     │
     └→ WebhooksService logs delivery result (status, responseTime)
```

### 4.2 Cross-Pipeline Routing Flow

```
PipelineOrchestratorService.route(task, pipeline)
     │
     ├── RoutingRule.targetQueueId set → normal enqueue (existing)
     │
     └── RoutingRule.targetPipelineId set → cross-pipeline transfer
              │
              ├── Check task.pipelineHops < MAX_HOPS (3)
              ├── Increment task.pipelineHops
              ├── Emit task.pipeline_transferred event
              └── Re-call ingestTask() with targetPipelineId
                  (bypasses dedup; fresh validate/transform/route)
```

### 4.3 Outbound Webhook Flow

```
EventStoreService.append(event)
     │
     └→ OutboundWebhookService.onEvent(event)
              │
              ├── Find Pipeline for event's aggregateId
              ├── Check pipeline.callbackEvents includes event.type
              ├── POST to pipeline.callbackUrl
              │   Headers: X-Nexus-Signature: sha256={hmac}
              │   Body: { taskId, pipelineId, eventType, timestamp, metadata }
              ├── Retry (3 attempts: 5s, 25s, 125s) on failure
              └── Log delivery to EventStoreService
                  (outbound.webhook.sent / outbound.webhook.failed)
```

### 4.4 Pipeline Export JSON Schema

```json
{
  "exportVersion": "1",
  "exportedAt": "2026-03-20T00:00:00Z",
  "pipeline": {
    "name": "...",
    "description": "...",
    "workTypes": [...],
    "dataSchema": [...],
    "sla": { ... },
    "callbackUrl": "...",
    "callbackEvents": [...]
  },
  "queues": [{ "name": "...", "priority": ..., "requiredSkills": [...] }],
  "routingRules": [{ "name": "...", "conditions": [...], "targetQueueName": "..." }],
  "ruleSets": [{ "name": "...", "rules": [...] }]
}
```

---

## 5. Phase 5 Plan Structure

Three plans across two waves:

| Wave | Plan | Focus |
|---|---|---|
| Wave 1 | `1-1-backend-integration-core` | Shared models + webhook ingestion + cross-pipeline routing + outbound webhooks |
| Wave 2 | `2-1-webhook-ui` | Designer UI: webhook endpoint management + delivery log |
| Wave 2 | `2-2-pipeline-portability` | Cross-pipeline routing UI + pipeline export/import/clone |

Wave 2 plans are parallel (no dependencies between them).

---

## Tech Debt

### Current Baseline

| Project | Errors | Status |
|---|---|---|
| `agent-workspace` | **0** | ✅ Fully cleared (Phase 4 Wave 3) |
| `api-server` | **0** | ✅ Fully cleared (Phase 4 Wave 1) |

### Categories to Target

None — both projects are at zero errors.

### Files Touched by Phase 5 in TECH_DEBT.md

No files in the Phase 5 feature scope appear in TECH_DEBT.md (all entries cleared in Phase 4).

### Debt Task Scope

**SKIPPED** — Both `agent-workspace` and `api-server` have **0 pre-existing lint errors**. Per policy, the Wave 1 debt reduction task is omitted when both projects show zero errors. Wave 1 starts directly with feature implementation.

No regression target: both projects must remain at 0 errors after Phase 5.
