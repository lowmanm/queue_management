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

## Phase 5 — External Integrations & Advanced Routing

> Scoped 2026-03-20. Goal: Connect Nexus to real source systems via webhook ingestion and outbound callbacks, enable cross-pipeline task routing for complex workflows, and add pipeline portability (export/import/clone) for Designer productivity.

### v1 Requirements (Must Have)

#### Webhook Ingestion Gateway

| ID | Requirement | Deliverable |
|---|---|---|
| P5-001 | Designer can create a webhook endpoint scoped to a pipeline; system generates a URL (`POST /api/webhooks/{token}`) and a secret for HMAC verification | Webhook Ingestion Gateway |
| P5-002 | `POST /api/webhooks/{token}` accepts a JSON payload, validates the HMAC-SHA256 signature (`X-Nexus-Signature` header), checks endpoint is active, and routes the payload through `PipelineOrchestratorService.ingestTask()` | Webhook Ingestion Gateway |
| P5-003 | Webhook ingestion returns HTTP 202 (accepted) on success, 400 on schema/signature error, 403 on invalid token, 429 when pipeline queue is at capacity | Webhook Ingestion Gateway |
| P5-004 | Webhook delivery attempts are logged with timestamp, source IP, payload size, status code, and processing result (QUEUED/DLQ/REJECTED) | Webhook Ingestion Gateway |
| P5-005 | Designer UI at `/admin/webhooks` lists all webhook endpoints (name, pipeline, URL, status, last-delivery timestamp) with create/delete/regenerate-token actions | Webhook Config UI |
| P5-006 | Webhook delivery log viewable per endpoint (paginated, filterable by status and date range) | Webhook Config UI |

#### Outbound Webhooks / Event Callbacks

| ID | Requirement | Deliverable |
|---|---|---|
| P5-010 | Pipeline config includes optional `callbackUrl` (string) and `callbackEvents` (array of event types: `task.completed`, `task.dlq`, `sla.breach`) | Outbound Webhooks |
| P5-011 | `OutboundWebhookService` sends HTTP POST to `callbackUrl` when a subscribed event fires for a task belonging to that pipeline | Outbound Webhooks |
| P5-012 | Outbound payload: `{ taskId, pipelineId, eventType, timestamp, taskMetadata }` signed with HMAC-SHA256 (`X-Nexus-Signature` header) | Outbound Webhooks |
| P5-013 | Retry logic: up to 3 delivery attempts with exponential backoff (5 s, 25 s, 125 s); failure after 3 attempts logs `outbound.webhook.failed` to EventStoreService | Outbound Webhooks |
| P5-014 | Pipeline wizard includes a "Callbacks" step to configure `callbackUrl` and `callbackEvents` checkboxes | Outbound Webhooks |

#### Cross-Pipeline Task Routing

| ID | Requirement | Deliverable |
|---|---|---|
| P5-020 | `RoutingRule` model adds optional `targetPipelineId` field; when set, the routing action is "transfer to pipeline" instead of "enqueue in queue" | Cross-Pipeline Routing |
| P5-021 | `PipelineOrchestratorService` detects cross-pipeline routing rules; re-ingests the task into the target pipeline's full validate→transform→route flow | Cross-Pipeline Routing |
| P5-022 | Cross-pipeline transfers are loop-safe: task carries a `pipelineHops` counter; when `pipelineHops >= 3` the task is sent to DLQ with reason `hop_limit_exceeded` | Cross-Pipeline Routing |
| P5-023 | Each cross-pipeline transfer emits a `task.pipeline_transferred` event to `EventStoreService` with source and target pipeline IDs | Cross-Pipeline Routing |
| P5-024 | Pipeline routing rule editor allows selecting "Transfer to Pipeline" as the routing action, with a dropdown of all active pipelines (excluding current) | Cross-Pipeline Routing UI |

#### Pipeline Portability

| ID | Requirement | Deliverable |
|---|---|---|
| P5-030 | Designer can export a pipeline as a JSON bundle containing pipeline metadata, queues, routing rules, rule sets, SLA config, and callback config | Pipeline Export |
| P5-031 | Designer can import a pipeline JSON bundle — creates a new pipeline with new system-generated IDs (import never overwrites existing pipelines) | Pipeline Import |
| P5-032 | Import validates the JSON bundle structure and returns field-level validation errors before creating anything | Pipeline Import |
| P5-033 | Designer can clone an existing pipeline — duplicates all queues, routing rules, and rule sets with new IDs; new pipeline name gets "(Copy)" suffix | Pipeline Clone |
| P5-034 | Export→import is round-trip faithful: a pipeline exported and re-imported produces logically identical routing behaviour | Pipeline Export/Import |

### v2 Requirements (Nice to Have)

| ID | Requirement | Notes |
|---|---|---|
| P5-100 | OAuth2/OIDC external provider (Okta, Azure AD, Google) via `@nestjs/passport` | Large auth infrastructure change; internal JWT sufficient for near-term |
| P5-101 | Visual drag-and-drop pipeline flow builder | Form-based UI is functional; evaluate after user feedback |
| P5-102 | Rule set import/export as standalone JSON (not bundled with pipeline) | P3-101 deferred; useful for cross-pipeline rule sharing |
| P5-103 | Webhook endpoint rate limiting (per-token request throttle) | Useful for production hardening; requires @nestjs/throttler setup |
| P5-104 | Event sourcing replay — rebuild service state from `task_events` table | Advanced; safe to capture events first as done in Phase 4 |

### Out of Scope for Phase 5

| Item | Reason | Target |
|---|---|---|
| Multi-tenancy | Single organization deployment; architectural overhaul required | Out of scope |
| Real GCS/S3/SFTP connectors | Volume Loader stubs sufficient; cloud connectors require credentials management | Phase 6+ |
| Grafana dashboard JSON | P4-102 deferred; observability stack not fully deployed | Phase 6+ |
| PagerDuty SLA breach integration | P4-103 deferred; requires PagerDuty account and alerting policy design | Phase 6+ |

---

*Last Updated: March 2026*
*Version: 1.1*
