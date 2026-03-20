# Phase 6 Research — Observability, Hardening & Storage Connectors

> Research conducted: 2026-03-20

---

## 1. Current State (post-Phase 5)

### Project Health

| Metric | Status |
|---|---|
| Build | ✅ Passing (both projects) |
| Lint | ✅ 0 errors (agent-workspace + api-server) |
| Tests | ✅ 126 passing (95 agent-workspace + 31 api-server) |
| Tech Debt | 0 errors both projects (fully cleared Phase 4) |

### Completed Phases

- **Phase 1–2**: Core platform (auth, state machine, WebSocket, real-time push)
- **Phase 2.5a/b**: SPA shell + orchestration core
- **Phase 3**: Logic Builder (pipeline wizard, rule builder, DLQ monitor)
- **Phase 4**: Persistence + Production (PostgreSQL/TypeORM, Redis, JWT, Prometheus, Docker)
- **Phase 5**: External Integrations (webhook ingestion, outbound callbacks, cross-pipeline routing, pipeline portability)

---

## 2. Existing Infrastructure Relevant to Phase 6

### Monitoring (`apps/api-server/src/app/monitoring/`)

| File | What it does |
|---|---|
| `metrics.service.ts` | prom-client registry; 6 custom `nexus_*` metrics (queue depth gauge, tasks counter, handle time histogram, agents gauge, SLA breaches counter, DLQ depth gauge) |
| `metrics.controller.ts` | `GET /api/metrics` — Prometheus text format scrape endpoint (public) |
| `health.controller.ts` | `GET /api/health` — @nestjs/terminus checks DB + Redis |

**Gap:** No Grafana dashboard JSON, no Prometheus alert rules, no JSON metrics endpoint for frontend consumption, no docker-compose monitoring profile.

### Webhooks (`apps/api-server/src/app/webhooks/`)

- `WebhooksService` — in-memory endpoint store, HMAC verification, delivery logging
- `WebhooksController` — `POST /api/webhooks/:token` (public), admin CRUD
- **Gap:** No rate limiting on the public ingestion endpoint (P5-103 deferred).
- `WebhookEndpoint` model in `webhook.interface.ts` has no `rateLimit` field.

### Queues (`apps/api-server/src/app/queues/`)

- `QueuesService` — queue CRUD, stats, bulk-by-filter not implemented
- `QueuesController` — standard CRUD + stats endpoints
- `DlqController` (`dlq.controller.ts`) — retry, reroute, discard for individual tasks
- **Gap:** No `POST /api/queues/bulk` endpoint. No DLQ auto-retry scheduler. `QueueConfig` has no `dlqAutoRetry` field.

### Event Store (`apps/api-server/src/app/services/event-store.service.ts`)

- Append-only `task_events` table; `emit()` persists domain events
- `GET /api/audit-log` returns paginated events
- **Gap:** No replay endpoint. No `replayAggregate()` method to reconstruct task state from event sequence.

### Volume Loader (`apps/api-server/src/app/volume-loader/`)

- `VolumeLoaderService` — ~2000 lines; handles CRUD, execution, CSV/JSON parsing
- Supports `VolumeLoaderType`: `GCS`, `S3`, `SFTP`, `HTTP`, `LOCAL`
- **Gap:** GCS, S3, SFTP connectors are stubs. No `IStorageConnector` abstraction. No `test-connection` endpoint.
- `volume-loader.interface.ts` has `s3Config`, `gcsConfig`, `sftpConfig` fully typed — ready for real implementations.

### Rules (`apps/api-server/src/app/rules/`)

- `RulesController` — rule set CRUD + test endpoint
- Business logic delegates to `RuleEngineService` (in `services/`)
- **Gap:** No export/import endpoints. `RuleEngineService` has no `exportRuleSet()` / `importRuleSet()` methods.
- `rule.interface.ts` — has `RuleSet`, `Rule`, `RuleCondition`, `RuleAction` — no bundle type.

### Pipelines (`apps/api-server/src/app/pipelines/`)

- `PipelineController` — full CRUD, metrics, versions (`GET /:id/versions`, rollback), portability (export/import/clone)
- `PipelineVersionService` — in-memory version store (max 20 versions)
- **Gap:** No diff endpoint comparing two version snapshots. `PipelineVersion` has a `config` field with the full pipeline snapshot — diff logic is straightforward.

### Frontend Admin Routes

Current routes in `admin.routes.ts`:
- `/admin/volume-loaders` → VolumeLoaderComponent
- `/admin/pipelines` → PipelinesComponent
- `/admin/skills` → SkillsComponent
- `/admin/dispositions` → DispositionsComponent
- `/admin/work-states` → WorkStatesComponent
- `/admin/users` → UsersComponent
- `/admin/audit-log` → AuditLogComponent
- `/admin/webhooks` → WebhooksComponent
- `/admin/rule-builder` → RuleBuilderComponent
- **Gap:** No `/admin/observability` route.

---

## 3. Deferred Items from Previous Phases

| ID | From | Item |
|---|---|---|
| P4-102 | Phase 4 v2 | Grafana dashboard JSON committed to repo |
| P4-103 | Phase 4 v2 | PagerDuty SLA breach integration |
| P3-101 | Phase 3 v2 | Rule set import/export as JSON |
| P3-102 | Phase 3 v2 | Pipeline config diff view |
| P3-103 | Phase 3 v2 | Bulk queue operations |
| P3-104 | Phase 3 v2 | DLQ auto-retry policies |
| P5-102 | Phase 5 v2 | Rule set import/export as standalone JSON |
| P5-103 | Phase 5 v2 | Webhook endpoint rate limiting |
| P5-104 | Phase 5 v2 | Event sourcing replay |
| Phase 5 OOS | Phase 5 | GCS/S3/SFTP connectors for VolumeLoader |

> Note: P4-103 (PagerDuty) requires a PagerDuty account and alerting policy design — descoped from Phase 6 to "Out of Scope." Grafana dashboard (P4-102) and Prometheus alert rules are feasible without external accounts.

---

## 4. Tech Debt Audit

### Current Baseline

| Project | Errors | Status |
|---|---|---|
| `agent-workspace` | **0** | ✅ Fully cleared Phase 4 Wave 3 |
| `api-server` | **0** | ✅ Fully cleared Phase 4 Wave 1 |

### Categories to Target

None — both projects are at zero errors.

### Files Touched by Phase 6 in TECH_DEBT.md

None — TECH_DEBT.md has no remaining affected files.

### Debt Task Scope

**No debt task required.** Both projects have zero pre-existing lint errors. TECH_DEBT.md policy requires a debt task when errors exist; since both are at 0, this Phase is explicitly exempt. This exemption will be noted in the Wave 1 plan.

---

## 5. Phase 6 Scope Decision

**Theme: Observability, Hardening & Storage Connectors**

**Goal:** Deliver production-grade observability (Grafana dashboard, Prometheus alert rules), harden the platform (webhook rate limiting, DLQ auto-retry policies, event sourcing replay), implement real cloud storage connectors (S3, GCS, SFTP) for the Volume Loader, and complete deferred portability features (rule set export/import, pipeline version diff).

### Excluded from Phase 6

| Item | Reason |
|---|---|
| PagerDuty SLA breach integration (P4-103) | Requires external account + alerting policy design; deferred to Phase 7+ |
| OAuth2/OIDC external provider (P5-100) | Large auth infrastructure change; internal JWT sufficient |
| Visual drag-and-drop flow builder (P5-101) | Form-based UI is functional; evaluate after user feedback |

---

## 6. Plan Decomposition Strategy

Four plans across three waves:

| Wave | Plan | Focus |
|---|---|---|
| 1 | 1-1-platform-hardening | Webhook rate limiting, DLQ auto-retry, event replay, bulk queue ops |
| 2 | 2-1-observability-alerting | Grafana, Prometheus alerts, docker-compose profile, admin metrics page |
| 2 | 2-2-storage-connectors | IStorageConnector abstraction, S3/GCS/SFTP implementations, test UI |
| 3 | 3-1-portability-completions | Rule set export/import, pipeline version diff view |

Wave 2 plans are independent of each other and can execute in parallel. Wave 3 has no hard dependency on either Wave 2 plan but logically follows them.

---

## 7. Key Technical Decisions

| Decision | Rationale |
|---|---|
| `@nestjs/throttler` for webhook rate limiting | Native NestJS solution; supports per-route and per-decorator configuration |
| `DlqAutoRetryService` as a scheduled NestJS service | `@Cron` from `@nestjs/schedule`; separate service keeps queue module thin |
| `IStorageConnector` interface abstraction | Enables polymorphic connector dispatch; makes adding future connectors trivial |
| Grafana dashboard as static JSON | Importable into any Grafana instance; no Grafana API credentials required |
| `GET /api/metrics/json` for frontend metrics | Avoids parsing Prometheus text format in Angular; clean JSON contract |
| Rule set bundle version field | Enables future format migrations if rule model evolves |
| Pipeline diff via version snapshot comparison | `PipelineVersionService` already stores full config snapshots — diff is a field-walk |
