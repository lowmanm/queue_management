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

## Out of Scope (Explicit)

| Item | Reason |
|---|---|
| Mobile app | Desktop-only workforce; browser SPA sufficient |
| Multi-tenancy | Single organization deployment |
| Drag-and-drop visual flow builder | Phase 3 uses form-based UI; visual flow builder is Phase 5+ if needed |
| Source system integrations | Nexus doesn't own work records; source system adapters are Phase 4+ |

---

*Last Updated: March 2026 (Phase 4 complete — all 23 v1 requirements shipped)*
*Version: 1.2*
