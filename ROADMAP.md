# Nexus Queue — Roadmap

> **Single source of truth for project phasing, deliverables, and status.**
> Referenced by STATE.md (current position) and REQUIREMENTS.md (per-phase requirements).

---

## Milestone 1: Foundation → Real-time Orchestration

### Phase 1 — Foundation ✅

**Status:** Complete
**Branch:** `develop` (merged)

| Deliverable | Description |
|---|---|
| Mock auth system | Persona selector with AGENT/MANAGER/DESIGNER/ADMIN roles |
| Agent state machine | OFFLINE → IDLE → RESERVED → ACTIVE → WRAP_UP → IDLE |
| Basic task distribution | Round-robin task assignment to connected agents |
| Angular workspace | Standalone component architecture with Nx monorepo |
| NestJS API server | Feature-module organization at `/api` prefix |
| Shared models library | `@nexus-queue/shared-models` with 11 interface files |

---

### Phase 2 — Real-time Push ✅

**Status:** Complete
**Branch:** `develop` (merged)

| Deliverable | Description |
|---|---|
| WebSocket gateway | Socket.io-based AgentGateway with event protocol |
| Force Mode delivery | Server pushes tasks to agents (no polling) |
| Task actions | Accept, reject, complete, transfer via WebSocket events |
| Reconnection logic | Client-side reconnection with max 5 attempts |
| Agent controls | Ready/not-ready toggle, session management |

---

### Phase 2.5a — SPA Architecture ✅

**Status:** Complete
**Branch:** `develop` (merged)

| Deliverable | Description |
|---|---|
| AppShellComponent | Persistent layout shell with `<router-outlet>` |
| Dashboard | Role-appropriate landing page with quick-nav cards |
| Fullscreen workspace | `{ fullscreen: true }` route data hides shell chrome |
| RBAC navigation | Sidebar organized by functional area, visibility gated by role |
| Lazy-loaded modules | Admin and Manager route trees load on demand |
| Route guards | authGuard, permissionGuard, agentGuard, designerGuard, managerGuard, adminGuard |

---

### Phase 2.5b — Orchestration Core ✅

**Status:** Complete
**Branch:** `develop` (merged)

| Deliverable | Description |
|---|---|
| PipelineOrchestratorService | Central ingestion: validate → transform → route → enqueue |
| QueueManagerService | Priority queue with DLQ and backpressure |
| TaskStoreService | Single task lifecycle store (in-memory) |
| TaskDistributorService | Agent-task matching via skill/workload/idle-time scoring |
| SLAMonitorService | Periodic SLA compliance checking and escalation |
| RuleEngineService | Task transformation via configurable rule sets |
| RoutingService | Agent scoring algorithm (skill match, workload, idle time) |
| Volume loader admin | Designer UI for configuring CSV/API data sources |
| Pipeline admin | Designer UI for pipeline CRUD |
| Skills admin | Designer UI for skill management + agent-skill assignment |
| Dispositions admin | Designer UI for disposition tree management |
| Work states admin | Designer UI for custom work state configuration |
| Manager dashboards | Team dashboard, queue monitor, skill assignments |

---

## Milestone 2: Configuration Intelligence

### Phase 3 — Logic Builder ✅

**Status:** Complete — PR open on `claude/dlq-monitor-pipeline-status-Iq03S` → `develop`
**Target branch:** `feature/NQ-300-logic-builder`
**Requirements:** See `REQUIREMENTS.md` §Phase 3
**Plans:** `.planning/phases/3/`

**Goal:** Give Designers a visual, no-code interface to configure queue routing logic, create pipelines end-to-end, and monitor failed tasks — replacing the current API/seed-data approach with a self-service configuration experience.

| Deliverable | Category | Status | Description |
|---|---|---|---|
| Pipeline Creation Wizard | Frontend | ✅ Done | Step-by-step wizard: name → schema → routing rules → queue assignment → SLA config |
| Rule Builder UI | Frontend | ✅ Done | Visual condition/action builder for RuleEngine rule sets (form-based) |
| Routing Rule Editor | Frontend | ✅ Done | Configure pipeline routing rules with condition trees (field, operator, value → target queue) |
| Queue Configuration Panel | Frontend | ✅ Done | Create/edit queues with priority, required skills, capacity, SLA thresholds |
| DLQ Monitor | Frontend | ✅ Done | View dead-lettered tasks, inspect failure reasons, retry/reassign/discard actions |
| Pipeline Status Dashboard | Frontend | ✅ Done | Real-time pipeline health: throughput, error rate, SLA compliance per pipeline |
| Pipeline Validation | Backend | ✅ Done | Dry-run validation endpoint — test pipeline config against sample data before activation |
| Rule Set Testing | Backend | ✅ Done | Test rule set execution against sample tasks with before/after comparison |
| Configuration Versioning | Backend | ✅ Done | Track pipeline config changes with rollback capability (max 20 versions, in-memory) |
| Pipeline Metrics API | Backend | ✅ Done | Per-pipeline and aggregate metrics; real-time `pipeline:metrics` WebSocket broadcast |
| DLQ API | Backend | ✅ Done | Filter, stats, retry, reroute, discard endpoints for dead-letter queue |
| Phase 3 Shared Models | Models | ✅ Done | `PipelineMetrics`, `PipelineValidationResult`, `PipelineVersion`, `RuleSetTestRequest/Response` |

---

### Phase 4 — Persistence + Production ✅

**Status:** Complete — PR open on `claude/add-status-endpoint-dLDyi` → `develop`
**Target branch:** `feature/NQ-400-persistence-production`
**Requirements:** See `REQUIREMENTS.md` §Phase 4
**Plans:** `.planning/phases/4/`

**Goal:** Replace in-memory stores with durable persistence, add horizontal scaling, and prepare for production deployment.

| Deliverable | Category | Status | Description |
|---|---|---|---|
| PostgreSQL queue backing | Backend | ✅ Done | TypeORM DatabaseModule, 17 entities, migrations, seed script; dual SQLite(dev)/PostgreSQL(prod) |
| Redis real-time layer | Backend | ✅ Done | RedisModule (graceful fallback), agent state + session HASH, pub/sub task distribution |
| Event sourcing | Backend | ✅ Done | EventStoreService, `task_events` append-only table, 11 domain events |
| Audit log UI | Frontend | ✅ Done | AuditLogComponent at `/admin/audit-log` with filters + pagination (adminGuard) |
| Real authentication | Backend | ✅ Done | JWT AuthModule (bcrypt), JwtAuthGuard globally applied, `@Public()` opt-out |
| Real auth frontend | Frontend | ✅ Done | AuthService rewrite: real login, localStorage JWT, auto-refresh interceptor |
| Monitoring & alerting | Infra | ✅ Done | Prometheus metrics (6 custom `nexus_*`), `GET /api/health` via @nestjs/terminus |
| Production deployment | Infra | ✅ Done | Multi-stage Dockerfiles (api + nginx), docker-compose.yml (postgres+redis+api+web) |
| Accessibility debt | Frontend | ✅ Done | agent-workspace lint errors: 119 → 0 (100% cleared) |

---

### Phase 5 — External Integrations & Advanced Routing ✅

**Status:** Complete — PR open on `claude/verify-phase-5-XinDF` → `develop`
**Target branch:** `feature/NQ-500-external-integrations`
**Requirements:** See `REQUIREMENTS.md` §Phase 5
**Plans:** `.planning/phases/5/`

**Goal:** Connect Nexus to real source systems via webhook ingestion and outbound callbacks, enable cross-pipeline task routing for complex workflows, and add pipeline portability (export/import/clone) for Designer productivity.

| Deliverable | Category | Status | Description |
|---|---|---|---|
| Webhook Ingestion Gateway | Backend | ✅ Done | `POST /api/webhooks/{token}` — HMAC-SHA256 signed, delivery log, in-memory endpoint store |
| Webhook Config UI | Frontend | ✅ Done | `/admin/webhooks` — endpoint list, create/delete/regen-token, delivery log panel, secret-reveal banner |
| Outbound Webhooks | Backend | ✅ Done | `OutboundWebhookService` — HMAC-signed HTTP callbacks, 3-retry backoff (5s/25s/125s), EventStore logging |
| Pipeline Callbacks Step | Frontend | ✅ Done | Pipeline wizard step 6 — `callbackUrl` + `callbackEvents` checkboxes, validation |
| Cross-Pipeline Routing | Backend | ✅ Done | `RoutingRule.targetPipelineId`, `MAX_PIPELINE_HOPS=3`, `task.pipeline_transferred` events, DLQ on hop limit |
| Cross-Pipeline Routing UI | Frontend | ✅ Done | Wizard routing rule editor — "Transfer to Pipeline" action type with active-pipeline dropdown |
| Pipeline Export/Import | Backend | ✅ Done | `GET :id/export`, `POST import` (field-level validation, new IDs on import) — round-trip faithful |
| Pipeline Clone | Backend | ✅ Done | `POST :id/clone` — deep copy, "(Copy)" suffix, starts inactive |
| Pipeline Portability UI | Frontend | ✅ Done | `PipelinePortabilityComponent` — export download, import file upload with error display, clone |

---

---

## Milestone 3: Observability, Hardening & Storage

### Phase 6 — Observability, Hardening & Storage Connectors 🔄

**Status:** In Planning
**Target branch:** `feature/NQ-600-observability-hardening`
**Requirements:** See `REQUIREMENTS.md` §Phase 6
**Plans:** `.planning/phases/6/`

**Goal:** Deliver production-grade observability (Grafana dashboard, Prometheus alert rules), harden the platform (webhook rate limiting, DLQ auto-retry policies, event sourcing replay, bulk queue operations), implement real cloud storage connectors (S3, GCS, SFTP) for the Volume Loader, and complete deferred portability features (rule set export/import, pipeline version diff view).

| Deliverable | Category | Status | Description |
|---|---|---|---|
| Webhook Rate Limiting | Backend | 🔲 Planned | @nestjs/throttler; per-token 100 req/60s, configurable; RATE_LIMITED delivery log |
| DLQ Auto-Retry Policies | Backend | 🔲 Planned | DlqAutoRetryService scheduler; configurable interval, maxRetries, backoffMultiplier per queue |
| Event Sourcing Replay | Backend | 🔲 Planned | GET /api/audit-log/replay/:aggregateId; EventStoreService.replayAggregate() state reducer |
| Bulk Queue Operations | Backend | 🔲 Planned | POST /api/queues/bulk — activate/deactivate/pause with partial-success reporting |
| DLQ Config UI | Frontend | 🔲 Planned | Queue Config Panel — DLQ Auto-Retry section; Queue Monitor — bulk selection + toolbar |
| Audit Log Replay UI | Frontend | 🔲 Planned | Step-by-step task state reconstruction timeline |
| Grafana Dashboard | Infra | 🔲 Planned | grafana/nexus-queue-dashboard.json — 6-panel importable dashboard |
| Prometheus Alert Rules | Infra | 🔲 Planned | prometheus/alerts.yml — 4 rules (queue high, SLA breach, DLQ depth, API down) |
| Monitoring Docker Profile | Infra | 🔲 Planned | docker-compose --profile monitoring adds Prometheus + Grafana services |
| JSON Metrics Endpoint | Backend | 🔲 Planned | GET /api/metrics/json — MetricsSnapshot for Angular frontend consumption |
| Admin Observability Page | Frontend | 🔲 Planned | /admin/observability — live metric tiles, per-queue depth table |
| S3 Connector | Backend | 🔲 Planned | S3ConnectorService via @aws-sdk/client-s3; bucket/prefix/region config |
| GCS Connector | Backend | 🔲 Planned | GcsConnectorService via @google-cloud/storage; GOOGLE_APPLICATION_CREDENTIALS |
| SFTP Connector | Backend | 🔲 Planned | SftpConnectorService via ssh2-sftp-client; privateKey or password auth |
| IStorageConnector Abstraction | Backend | 🔲 Planned | Polymorphic connector interface; VolumeLoader routes by loaderType |
| Connector Test UI | Frontend | 🔲 Planned | Volume Loader — Test Connection button; shows sample file listing |
| Rule Set Export/Import | Backend | 🔲 Planned | GET /api/rules/sets/:id/export; POST /api/rules/sets/import with UUID rewrite |
| Rule Builder Export/Import UI | Frontend | 🔲 Planned | Export JSON download + Import JSON file upload with validation errors |
| Pipeline Version Diff | Backend | 🔲 Planned | GET /api/pipelines/:id/versions/diff?v1&v2 — field-level VersionDiffResult |
| Pipeline Diff View | Frontend | 🔲 Planned | PipelineDiffModalComponent — version selector + color-coded diff table |

---

## Out of Scope (Explicit)

| Item | Reason |
|---|---|
| Mobile app | Desktop-only workforce; browser SPA sufficient |
| Multi-tenancy | Single organization deployment |
| Drag-and-drop visual flow builder | Phase 3 uses form-based UI; visual flow builder is Phase 5+ if needed |
| Source system integrations | Nexus doesn't own work records; source system adapters are Phase 4+ |

---

*Last Updated: March 2026 (Phase 6 planning — 27 v1 requirements defined)*
*Version: 1.4*
