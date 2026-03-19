# Phase 4 — Persistence + Production — Research

> Generated: 2026-03-19 | Scope: Phase 4 planning

---

## 1. Current State Summary

All prior phases are complete and merged into `develop`. The system is fully functional
with in-memory storage. This research documents what exists and what Phase 4 must change.

---

## 2. Backend Services Inventory

### In-Memory Stores to Migrate (by service)

| Service | Store | Type | Migration Target |
|---|---|---|---|
| `TaskStoreService` | `tasks` | `Map<string, Task>` | PostgreSQL `tasks` table |
| `TaskStoreService` | `externalIdIndex` | `Map<string, string>` | Unique index on `tasks.external_id` |
| `QueueManagerService` | `queues` | `Map<string, QueuedTask[]>` | PostgreSQL `queue_tasks` table |
| `QueueManagerService` | `dlq` | `DLQEntry[]` | PostgreSQL `dead_letter_queue` table |
| `QueueManagerService` | `completedWaitTimes` | `Map<string, number[]>` | Aggregated metrics view |
| `AgentManagerService` | `agents` | `Map<string, ConnectedAgent>` | Redis HASH (ephemeral, TTL) |
| `AgentManagerService` | `socketToAgent` | `Map<string, string>` | Redis HASH (ephemeral) |
| `AgentSessionService` | `sessions` | `Map<string, AgentSession>` | Redis HASH + PostgreSQL for history |
| `AgentSessionService` | `stateHistory` | `StateChangeEvent[]` | PostgreSQL `state_events` table |
| `AgentSessionService` | `workStateConfigs` | `Map<AgentWorkState, WorkStateConfig>` | PostgreSQL `work_state_configs` table |
| `DispositionService` | `dispositions` | `Map<string, Disposition>` | PostgreSQL `dispositions` table |
| `DispositionService` | `completions` | `TaskCompletion[]` | PostgreSQL `task_completions` table |
| `RuleEngineService` | `ruleSets` | `Map<string, RuleSet>` | PostgreSQL `rule_sets` + `rules` tables |
| `RBACService` | `users` | `Map<string, User>` | PostgreSQL `users` table |
| `RBACService` | `teams` | `Map<string, Team>` | PostgreSQL `teams` table |
| `RBACService` | `sessions` | `Map<string, UserSession>` | Redis (JWT-based, stateless) |
| `PipelineService` | `pipelines` | `Map<string, Pipeline>` | PostgreSQL `pipelines` table |
| `PipelineService` | `queues` | `Map<string, PipelineQueue>` | PostgreSQL `pipeline_queues` table |
| `RoutingService` | `skills` | `Map<string, Skill>` | PostgreSQL `skills` table |
| `RoutingService` | `agentSkills` | `Map<string, AgentSkill[]>` | PostgreSQL `agent_skills` join table |
| `RoutingService` | `strategies` | `Map<string, RoutingStrategy>` | PostgreSQL `routing_strategies` table |
| `TaskSourceService` | `sources` | `Map<string, TaskSource>` | PostgreSQL `task_sources` table |
| `TaskSourceService` | `pendingOrders` | `PendingOrder[]` | PostgreSQL `pending_orders` table |
| `VolumeLoaderService` | `loaders` | `Map<string, VolumeLoader>` | PostgreSQL `volume_loaders` table |
| `VolumeLoaderService` | `runs` | `VolumeLoaderRun[]` | PostgreSQL `volume_loader_runs` table |

**Ephemeral (runtime-only, NOT migrated to DB):**
- `VolumeLoaderService.scheduledIntervals` — NodeJS timer handles
- `SLAMonitorService.monitorInterval` — NodeJS timer handle
- `SLAMonitorService.recentBreaches` — Short-term sliding window (last 200 events)

---

## 3. Frontend Auth Analysis

### Current Mock Auth (AuthService)

The frontend `AuthService` uses:
- 4 hardcoded personas: AGENT, MANAGER, DESIGNER, ADMIN
- `localStorage` to persist session across page reloads
- Instant `loginAsRole()` switching for development convenience
- Computed permission sets per role (hardcoded in service)

### Phase 4 Auth Target

Replace mock auth with JWT-backed authentication:
- Real `POST /api/auth/login` endpoint (username + password → JWT token)
- `POST /api/auth/refresh` for token renewal
- Frontend stores JWT in `localStorage` (or `HttpOnly` cookie — chosen: `localStorage` for SPA simplicity)
- NestJS `JwtGuard` on all protected endpoints
- Keep persona convenience for development (seeded test users with persona passwords)
- `AuthService` updated to make real HTTP calls, store JWT, decode role from token claims

---

## 4. Event Sourcing Design

### Domain Events to Capture

| Event | Trigger | Payload |
|---|---|---|
| `task.ingested` | PipelineOrchestrator validates task | taskId, pipelineId, sourceId, payload |
| `task.queued` | QueueManager enqueues task | taskId, queueId, priority |
| `task.assigned` | TaskDistributor assigns to agent | taskId, agentId, routingDecision |
| `task.accepted` | Agent accepts via WebSocket | taskId, agentId |
| `task.rejected` | Agent rejects or timeout | taskId, agentId, reason |
| `task.completed` | Agent submits disposition | taskId, agentId, disposition |
| `task.dlq` | Task exceeds maxRetries | taskId, failureReason, retryCount |
| `task.retried` | Manager retries DLQ task | taskId, operatorId |
| `agent.state_changed` | Agent transitions state | agentId, fromState, toState, trigger |
| `sla.warning` | SLA threshold crossed | taskId, queueId, slaPercent |
| `sla.breach` | SLA deadline exceeded | taskId, queueId |

### Event Store Schema

```sql
CREATE TABLE task_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR(50) NOT NULL,
  aggregate_id  UUID NOT NULL,       -- taskId or agentId
  aggregate_type VARCHAR(20) NOT NULL, -- 'task' | 'agent'
  payload       JSONB NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pipeline_id   UUID,
  agent_id      UUID,
  sequence_num  BIGINT GENERATED ALWAYS AS IDENTITY
);

CREATE INDEX idx_events_aggregate ON task_events (aggregate_type, aggregate_id, occurred_at);
CREATE INDEX idx_events_type ON task_events (event_type, occurred_at DESC);
```

---

## 5. Infrastructure Design

### Docker Compose Services

| Service | Image | Purpose |
|---|---|---|
| `api` | Custom Dockerfile | NestJS API server |
| `web` | Custom Dockerfile | Angular frontend (nginx) |
| `postgres` | `postgres:16-alpine` | Primary database |
| `redis` | `redis:7-alpine` | Agent state cache + pub/sub |

### Database Configuration

- **Connection**: TypeORM with `DataSource` config in `DatabaseModule`
- **Migrations**: TypeORM migrations in `apps/api-server/src/migrations/`
- **Seeding**: Seed script for default users, roles, dispositions, work state configs
- **Environment vars**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`

### Prometheus Metrics

| Metric | Type | Description |
|---|---|---|
| `nexus_queue_depth` | Gauge | Current tasks per queue |
| `nexus_tasks_total` | Counter | Total tasks ingested (labeled by pipeline, status) |
| `nexus_task_handle_time_seconds` | Histogram | Agent task handle time distribution |
| `nexus_agents_active` | Gauge | Current agents by state |
| `nexus_sla_breaches_total` | Counter | SLA breaches by queue |
| `nexus_dlq_depth` | Gauge | Dead letter queue depth |

---

## 6. Package Dependencies (New)

### Backend (api-server)

```json
{
  "@nestjs/typeorm": "^11.0.0",
  "typeorm": "^0.3.x",
  "pg": "^8.x",
  "@nestjs/jwt": "^11.0.0",
  "@nestjs/passport": "^11.0.0",
  "passport": "^0.7.x",
  "passport-jwt": "^4.x",
  "bcrypt": "^5.x",
  "ioredis": "^5.x",
  "prom-client": "^15.x",
  "@nestjs/terminus": "^11.0.0"
}
```

### Backend Dev Dependencies

```json
{
  "@types/passport-jwt": "^4.x",
  "@types/bcrypt": "^5.x",
  "@types/ioredis": "^5.x"
}
```

---

## 7. Architecture Decision: ORM Choice

**Decision: TypeORM 0.3.x**

Rationale:
- Native NestJS integration (`@nestjs/typeorm`)
- Decorator-based entities align with NestJS patterns
- Active Record + Data Mapper both supported
- Migration CLI is robust
- Team familiarity (NestJS docs use TypeORM as primary example)
- Prisma considered but requires schema.prisma DSL — adds another file type

---

## 8. Key Risks and Mitigations

| Risk | Mitigation |
|---|---|
| PostgreSQL not running in dev | Docker Compose; fallback to in-memory mode via env flag |
| TypeORM migration conflicts | Generate migrations from entities; review before applying |
| Redis unavailable in dev | RedisModule uses `REDIS_URL` env; gracefully log error if missing |
| JWT secret rotation | Store in env var `JWT_SECRET`; short TTL (15min) + refresh token |
| Event log table growth | Add `occurred_at` range partition or periodic archival |
| Breaking existing tests | Update service unit tests to mock TypeORM repositories |

---

## Tech Debt

### Current Baseline (from TECH_DEBT.md — 2026-03-19)

| Project | Errors | Target |
|---|---|---|
| `agent-workspace` | 167 | 0 (full clearance target) |
| `api-server` | 10 | 0 (full clearance target) |

### api-server Analysis (10 errors — EASY, full clearance in Wave 1)

| Rule | Count | Files | Fix |
|---|---|---|---|
| `no-case-declarations` | 9 | `routing.service.ts`, `tasks.service.ts`, `volume-loader.service.ts` | Wrap `case` bodies in `{}` |
| `prefer-const` | 1 | `routing.service.ts` line 392 | Change `let` to `const` |

**All 10 api-server errors are purely mechanical. Wave 1 debt task clears all 10.**

### agent-workspace Analysis (167 errors — PARTIAL clearance in Wave 1)

Wave 1 target categories (purely mechanical, no logic changes):

| Rule | Count | Fix | Category |
|---|---|---|---|
| `@angular-eslint/prefer-inject` | 15 | Replace `constructor(private svc: Svc)` with `private svc = inject(Svc)` | TypeScript |
| `@angular-eslint/template/prefer-control-flow` | 29 | Replace `*ngIf`/`*ngFor` with `@if`/`@for` blocks | Template HTML |
| `@typescript-eslint/ban-ts-comment` | 3 | Remove `// @ts-ignore` + fix underlying type | TypeScript |
| `@angular-eslint/no-output-native` | 1 | Rename `@Output() click` to non-native name | TypeScript |

**Wave 1 clearance: 48 errors. agent-workspace: 167 → 119 (−48, −29% ✅ meets ≥20% target)**

Remaining 119 errors (accessibility rules) deferred to individual feature tasks that touch those files:

| Rule | Count | Strategy |
|---|---|---|
| `label-has-associated-control` | 44 | Add `for`/`id` to form labels — clear in Wave 3 frontend task |
| `interactive-supports-focus` | 36 | Add `tabindex="0"` + `role` — clear in Wave 3 frontend task |
| `click-events-have-key-events` | 36 | Add keyboard handlers — clear in Wave 3 frontend task |

**Wave 3 Plan (auth + monitoring frontend) will target full clearance of remaining 119 accessibility errors.**

### Files Touched by Phase 4 Feature Work vs. Tech Debt Files

The Phase 4 PostgreSQL migration touches `services/` files in `api-server` but NOT the component `.html` files listed in TECH_DEBT.md. The accessibility errors are in frontend component HTML files — these will be cleared in Wave 3 when the Auth/Monitoring frontend task touches those files systematically.

### Plan Coverage for Debt

| Wave | Plan | Debt Cleared | Remaining |
|---|---|---|---|
| Wave 1 | `1-1-debt-clearance-PLAN.md` | api-server: 10→0; workspace: 167→119 | 119 |
| Wave 3 | `3-1-auth-monitoring-deploy-PLAN.md` | workspace: 119→0 (accessibility sweep) | 0 |

**Total debt elimination: both projects reach 0 errors by end of Phase 4.**
