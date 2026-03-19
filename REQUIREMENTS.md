# Nexus Queue — Requirements

> **Phase-scoped requirements with traceability to ROADMAP.md deliverables.**
> Each requirement has a unique ID for reference in plans and verification.

---

## Phase 3 — Logic Builder

### v1 Requirements (Must Have)

#### Pipeline Creation Wizard

| ID | Requirement | Deliverable |
|---|---|---|
| P3-001 | Designer can create a new pipeline via a multi-step wizard (name, description, active/inactive) | Pipeline Creation Wizard |
| P3-002 | Wizard step 2: Define data schema with field name, type, and required flag | Pipeline Creation Wizard |
| P3-003 | Wizard step 3: Configure routing rules (condition → target queue) | Pipeline Creation Wizard |
| P3-004 | Wizard step 4: Assign queues with priority, skills, and capacity | Pipeline Creation Wizard |
| P3-005 | Wizard step 5: Set SLA config (warning threshold, breach threshold, escalation action) | Pipeline Creation Wizard |
| P3-006 | Wizard shows summary/review step before creation | Pipeline Creation Wizard |
| P3-007 | Pipeline can be saved as draft (inactive) or activated immediately | Pipeline Creation Wizard |

#### Rule Builder UI

| ID | Requirement | Deliverable |
|---|---|---|
| P3-010 | Designer can create rule sets with ordered rules | Rule Builder UI |
| P3-011 | Each rule has conditions (field, operator, value) and actions (set field, set priority, add skill, add tag) | Rule Builder UI |
| P3-012 | Conditions support operators: equals, not_equals, contains, greater_than, less_than, in, not_in, exists | Rule Builder UI |
| P3-013 | Rules can be reordered (drag-and-drop or up/down controls) | Rule Builder UI |
| P3-014 | Rule set can be tested against sample task data with before/after preview | Rule Set Testing |

#### Routing Rule Editor

| ID | Requirement | Deliverable |
|---|---|---|
| P3-020 | Designer can configure routing rules per pipeline | Routing Rule Editor |
| P3-021 | Routing rules use condition trees: field + operator + value → target queue | Routing Rule Editor |
| P3-022 | Default/fallback route when no conditions match | Routing Rule Editor |
| P3-023 | Routing rules can be tested with sample data showing which queue a task would route to | Pipeline Validation |

#### Queue Configuration

| ID | Requirement | Deliverable |
|---|---|---|
| P3-030 | Designer can create/edit/delete queues from the admin UI | Queue Configuration Panel |
| P3-031 | Queue config: name, priority range, required skills, max capacity | Queue Configuration Panel |
| P3-032 | Queue config: SLA thresholds (warning %, breach %, auto-escalation toggle) | Queue Configuration Panel |
| P3-033 | Queue list shows real-time depth and agent count | Queue Configuration Panel |

#### DLQ Monitor

| ID | Requirement | Deliverable |
|---|---|---|
| P3-040 | Manager/Admin can view all dead-lettered tasks with failure reason | DLQ Monitor |
| P3-041 | DLQ actions: retry (re-enqueue), reassign (to specific agent), reroute (different queue), discard | DLQ Monitor |
| P3-042 | DLQ shows task metadata, pipeline source, failure timestamp, retry count | DLQ Monitor |
| P3-043 | DLQ supports filtering by pipeline, failure reason, date range | DLQ Monitor |

#### Pipeline Status Dashboard

| ID | Requirement | Deliverable |
|---|---|---|
| P3-050 | Dashboard shows all pipelines with status (active/inactive/error) | Pipeline Status Dashboard |
| P3-051 | Per-pipeline metrics: tasks ingested, tasks completed, tasks in queue, SLA compliance % | Pipeline Status Dashboard |
| P3-052 | Per-pipeline metrics update in real-time via WebSocket | Pipeline Status Dashboard |

### v2 Requirements (Nice to Have)

| ID | Requirement | Notes |
|---|---|---|
| P3-100 | Pipeline cloning — duplicate existing pipeline as starting point | Saves designer time |
| P3-101 | Rule set import/export as JSON | Enables sharing/backup |
| P3-102 | Pipeline config diff view — compare two versions side by side | Requires P3 config versioning |
| P3-103 | Bulk queue operations — activate/deactivate multiple queues | Manager convenience |
| P3-104 | DLQ auto-retry policies — configure automatic retry schedules | Reduces manual intervention |

### Out of Scope for Phase 3

| Item | Reason | Target |
|---|---|---|
| Visual drag-and-drop flow builder | Form-based UI is sufficient for v1; evaluate after user feedback | Phase 5+ |
| Pipeline scheduling (time-based activation) | Requires scheduler infrastructure | Phase 4 |
| Cross-pipeline task routing | Single-pipeline routing is sufficient for v1 | Phase 4+ |
| Audit log UI | Requires event sourcing from Phase 4 | Phase 4 |

---

## Phase 4 — Persistence + Production

> Scoped 2026-03-19. Goal: Replace in-memory stores with durable persistence, add horizontal scaling, and prepare for production deployment.

### v1 Requirements (Must Have)

#### PostgreSQL Persistence

| ID | Requirement | Deliverable |
|---|---|---|
| P4-001 | Install TypeORM + pg driver; DatabaseModule provides a TypeORM `DataSource` configured from `DATABASE_URL` env var | PostgreSQL queue backing |
| P4-002 | TypeORM entities created for all core domain objects: Task, QueuedTask, DLQEntry, Pipeline, PipelineQueue, RuleSet, Rule, Disposition, Skill, AgentSkill, TaskSource, VolumeLoader, VolumeLoaderRun, User, Team, WorkStateConfig | PostgreSQL queue backing |
| P4-003 | TypeORM migration files generated from entities; `npm run db:migrate` applies all migrations | PostgreSQL queue backing |
| P4-004 | `QueueManagerService` migrated to TypeORM repository (PostgreSQL-backed `queue_tasks` table with `idx_queue_dequeue` index) | PostgreSQL queue backing |
| P4-005 | `TaskStoreService` migrated to TypeORM repository (PostgreSQL-backed `tasks` table) | PostgreSQL queue backing |
| P4-006 | `PipelineService`, `RuleEngineService`, `RoutingService`, `DispositionService`, `TaskSourceService`, `VolumeLoaderService`, `RBACService` migrated to TypeORM repositories | PostgreSQL queue backing |
| P4-007 | Database seed script populates default dispositions, work state configs, skills, roles, and test users on first run | PostgreSQL queue backing |

#### Redis Real-time Layer

| ID | Requirement | Deliverable |
|---|---|---|
| P4-010 | Install ioredis; `RedisModule` provides a singleton `ioredis` client configured from `REDIS_URL` env var | Redis real-time layer |
| P4-011 | `AgentManagerService` uses Redis HASH for connected agent state (key: `agent:{agentId}`, TTL: 60s refreshed on heartbeat) | Redis real-time layer |
| P4-012 | `AgentSessionService` uses Redis HASH for active sessions (key: `session:{agentId}`, TTL: 8h); session history persisted to PostgreSQL | Redis real-time layer |
| P4-013 | Redis pub/sub channel `task:distribute` used by `TaskDistributorService` for multi-instance task fan-out | Redis real-time layer |

#### Event Sourcing

| ID | Requirement | Deliverable |
|---|---|---|
| P4-020 | `EventStoreService` appends domain events to `task_events` table (append-only, never updated) | Event sourcing |
| P4-021 | Domain events emitted for: `task.ingested`, `task.queued`, `task.assigned`, `task.accepted`, `task.rejected`, `task.completed`, `task.dlq`, `task.retried`, `agent.state_changed`, `sla.warning`, `sla.breach` | Event sourcing |
| P4-022 | `GET /api/audit-log` endpoint returns paginated events filterable by `aggregateType`, `aggregateId`, `eventType`, `startDate`, `endDate` | Event sourcing |
| P4-023 | Frontend `AuditLogComponent` at `/admin/audit-log` renders event timeline with filters; protected by `adminGuard` | Event sourcing |

#### Real Authentication

| ID | Requirement | Deliverable |
|---|---|---|
| P4-030 | `AuthModule` provides `POST /api/auth/login` (username + password → `{ accessToken, refreshToken, user }`) using `bcrypt` password comparison and `@nestjs/jwt` token signing | Real authentication |
| P4-031 | `POST /api/auth/refresh` accepts a refresh token and returns a new access token (15-minute access TTL, 7-day refresh TTL) | Real authentication |
| P4-032 | `JwtAuthGuard` applied globally; all existing API routes protected; `POST /api/auth/login` and `GET /api/health` are public | Real authentication |
| P4-033 | Frontend `AuthService` replaces mock persona switching with real `POST /api/auth/login` call; JWT stored in `localStorage`; auto-refreshes before expiry | Real authentication |
| P4-034 | Seeded test users exist for each persona (agent1/agent1pass, manager1/manager1pass, designer1/designer1pass, admin1/admin1pass) so all existing demos work without code changes | Real authentication |

#### Monitoring & Health

| ID | Requirement | Deliverable |
|---|---|---|
| P4-040 | `prom-client` integration: `GET /api/metrics` returns Prometheus text format (public endpoint for scraping) | Monitoring & alerting |
| P4-041 | Custom metrics exposed: `nexus_queue_depth` (gauge, per queue), `nexus_tasks_total` (counter, labeled by status), `nexus_agents_active` (gauge, by state), `nexus_sla_breaches_total` (counter), `nexus_dlq_depth` (gauge) | Monitoring & alerting |
| P4-042 | `@nestjs/terminus` health endpoint: `GET /api/health` checks PostgreSQL connection, Redis connection, and application status; returns 200 OK or 503 | Monitoring & alerting |

#### Production Deployment

| ID | Requirement | Deliverable |
|---|---|---|
| P4-050 | `docker-compose.yml` at repo root defines services: `api` (NestJS), `web` (Angular/nginx), `postgres` (postgres:16-alpine), `redis` (redis:7-alpine) | Horizontal scaling |
| P4-051 | `apps/api-server/Dockerfile` builds a production NestJS image (multi-stage: build → runtime) | Horizontal scaling |
| P4-052 | `apps/agent-workspace/Dockerfile` builds a production Angular image (multi-stage: build → nginx serving) | Horizontal scaling |
| P4-053 | `README.md` updated with Docker quickstart: `docker-compose up` starts full stack | Horizontal scaling |

### v2 Requirements (Nice to Have)

| ID | Requirement | Notes |
|---|---|---|
| P4-100 | Read replica support in TypeORM config | Requires infrastructure; deferred |
| P4-101 | Redis Cluster configuration | Single-node sufficient for initial production |
| P4-102 | Grafana dashboard JSON (committed to repo) | Nice observability upgrade |
| P4-103 | PagerDuty integration for SLA breach alerts | Requires PagerDuty account |
| P4-104 | Event sourcing replay — rebuild service state from event log | Advanced; sufficient to capture events first |

### Out of Scope for Phase 4

| Item | Reason | Target |
|---|---|---|
| Visual flow builder | Phase 3 form-based UI is sufficient | Phase 5+ |
| Cross-pipeline task routing | Deferred from Phase 3 | Phase 5 |
| Multi-tenancy | Single organization deployment | Out of scope |
| Source system integrations (CRM, ACD) | Nexus doesn't own work records | Phase 5 |
| OAuth2/OIDC external provider | Internal JWT auth sufficient for v1 | Phase 5 |

---

*Last Updated: March 2026*
*Version: 1.0*
