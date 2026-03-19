# Phase 4 — Plan Verification

> Verifies that all Phase 4 v1 requirements are covered, plans are consistent, and
> conventions are followed. Generated: 2026-03-19.

---

## Requirement Coverage

### PostgreSQL Persistence (P4-001 to P4-007)

| ID | Requirement | Plan | Task |
|---|---|---|---|
| P4-001 | DatabaseModule + TypeORM DataSource from DATABASE_URL | 2-1 | Task 1 |
| P4-002 | TypeORM entities for all core domain objects | 2-1 | Task 2 |
| P4-003 | TypeORM migration files + `npm run db:migrate` | 2-1 | Task 5 |
| P4-004 | QueueManagerService → PostgreSQL `queue_tasks` with priority index | 2-1 | Task 3 |
| P4-005 | TaskStoreService → PostgreSQL `tasks` table | 2-1 | Task 3 |
| P4-006 | PipelineService, RuleEngineService, RoutingService, DispositionService, TaskSourceService, VolumeLoaderService, RBACService → TypeORM | 2-1 | Task 4 |
| P4-007 | Database seed script: dispositions, work states, skills, users, routing strategies | 2-1 | Task 5 |

**Coverage: 7/7 ✅**

### Redis Real-time Layer (P4-010 to P4-013)

| ID | Requirement | Plan | Task |
|---|---|---|---|
| P4-010 | RedisModule + ioredis client from REDIS_URL | 2-2 | Task 1 |
| P4-011 | AgentManagerService → Redis HASH for connected agents (60s TTL) | 2-2 | Task 2 |
| P4-012 | AgentSessionService → Redis HASH for sessions (8h TTL) | 2-2 | Task 2 |
| P4-013 | Redis pub/sub `nexus:task:distribute` for multi-instance distribution | 2-2 | Task 3 |

**Coverage: 4/4 ✅**

### Event Sourcing (P4-020 to P4-023)

| ID | Requirement | Plan | Task |
|---|---|---|---|
| P4-020 | EventStoreService + `task_events` table (append-only) | 2-2 | Task 4 |
| P4-021 | 11 domain events emitted across task lifecycle | 2-2 | Task 4 |
| P4-022 | GET /api/audit-log paginated + filterable | 2-2 | Task 5 |
| P4-023 | AuditLogComponent at /admin/audit-log (adminGuard) | 2-2 | Task 5 |

**Coverage: 4/4 ✅**

### Real Authentication (P4-030 to P4-034)

| ID | Requirement | Plan | Task |
|---|---|---|---|
| P4-030 | POST /api/auth/login → JWT tokens | 3-1 | Task 1 |
| P4-031 | POST /api/auth/refresh → new access token | 3-1 | Task 1 |
| P4-032 | JwtAuthGuard globally applied; public decorator for exempt routes | 3-1 | Task 1 |
| P4-033 | Frontend AuthService → real login, JWT in localStorage, auto-refresh | 3-1 | Task 2 |
| P4-034 | Seeded test users for each persona | 2-1 (seed) + 3-1 (bcrypt wiring) | Task 5, Task 1 |

**Coverage: 5/5 ✅**

### Monitoring & Health (P4-040 to P4-042)

| ID | Requirement | Plan | Task |
|---|---|---|---|
| P4-040 | GET /api/metrics → Prometheus text format | 3-1 | Task 3 |
| P4-041 | 5 custom metrics: queue_depth, tasks_total, agents_active, sla_breaches, dlq_depth | 3-1 | Task 3 |
| P4-042 | GET /api/health → PostgreSQL + Redis checks | 3-1 | Task 3 |

**Coverage: 3/3 ✅**

### Production Deployment (P4-050 to P4-053)

| ID | Requirement | Plan | Task |
|---|---|---|---|
| P4-050 | docker-compose.yml (api, web, postgres, redis) | 3-1 | Task 4 |
| P4-051 | apps/api-server/Dockerfile (multi-stage) | 3-1 | Task 4 |
| P4-052 | apps/agent-workspace/Dockerfile (multi-stage + nginx) | 3-1 | Task 4 |
| P4-053 | README.md Docker quickstart | 3-1 | Task 4 |

**Coverage: 4/4 ✅**

### Total: **23/23 v1 requirements covered ✅**

---

## Debt Reduction Verification

| Wave | Plan | agent-workspace | api-server | Target Met? |
|---|---|---|---|---|
| Wave 1 | 1-1-debt-clearance | 167 → 119 (−48, −29%) | 10 → 0 (−100%) | ✅ ≥20% in both |
| Wave 3 | 3-1-auth-monitoring | 119 → 0 (−100%) | 0 (maintained) | ✅ Full clearance |

**Post-Phase 4: Both projects at 0 lint errors ✅**

---

## Plan Dependency Verification

```
Wave 1 (independent):
  1-1-debt-clearance-PLAN.md

Wave 2 (after Wave 1 — can run in parallel):
  2-1-postgresql-persistence-PLAN.md  ──┐
  2-2-redis-event-sourcing-PLAN.md    ──┤ (parallel)
                                        │
Wave 3 (after both Wave 2 plans):       │
  3-1-auth-monitoring-deploy-PLAN.md ◄──┘
```

**No circular dependencies ✅**

Plans 2-1 and 2-2 are parallel:
- 2-1 touches: entity files, database module, services/*, pipelines/, routing/, volume-loader/, rbac
- 2-2 touches: redis/, entities/task-event.entity.ts, services/event-store, services/agent-manager, services/agent-session, audit-log/, frontend audit-log component
- File overlap: both touch `services/pipeline-orchestrator.service.ts`, `services/queue-manager.service.ts`, `gateway/agent.gateway.ts`

**⚠ WARNING — Parallel file conflict:** Plans 2-1 and 2-2 both modify:
- `apps/api-server/src/app/services/pipeline-orchestrator.service.ts`
- `apps/api-server/src/app/services/queue-manager.service.ts`
- `apps/api-server/src/app/gateway/agent.gateway.ts`
- `apps/api-server/src/app/services/sla-monitor.service.ts`

**Resolution:** Execute 2-1 first, then 2-2 uses the already-migrated async versions of these
services as its starting point. The plans should be treated as sequential within Wave 2 despite
being labeled parallel. Execution order: **2-1 then 2-2**.

**Corrected execution order:**
1. `1-1-debt-clearance-PLAN.md` (Wave 1)
2. `2-1-postgresql-persistence-PLAN.md` (Wave 2a — must complete first)
3. `2-2-redis-event-sourcing-PLAN.md` (Wave 2b — after 2-1)
4. `3-1-auth-monitoring-deploy-PLAN.md` (Wave 3 — after both Wave 2 plans)

---

## Convention Checklist

### Angular (Frontend)
- [x] All new components are standalone (`standalone: true`)
- [x] `OnPush` change detection specified for `AuditLogComponent`
- [x] `BehaviorSubject` state management used in updated `AuthService`
- [x] `takeUntil` subscription cleanup (existing pattern maintained)
- [x] `inject()` function used (Wave 1 fixes + new components)
- [x] `@if`/`@for` control flow used in new templates (Wave 1 migration + new templates)
- [x] `adminGuard` applied to `/admin/audit-log` route

### NestJS (Backend)
- [x] Feature-based module organization for new modules: `auth/`, `monitoring/`, `audit-log/`, `redis/`
- [x] Thin controllers — business logic in services
- [x] `@Injectable()` services with single responsibility
- [x] `@Global()` applied to `DatabaseModule` and `RedisModule` to avoid re-importing globally
- [x] Exception filters and proper HTTP error codes

### TypeScript
- [x] Strict mode — no `any` in new code
- [x] TypeORM entities use `@Column()` with explicit types
- [x] `@InjectRepository()` used for repository injection
- [x] Shared models imported from `@nexus-queue/shared-models`

### Testing
- [x] New `AuditLogComponent` has co-located `.spec.ts` (Plan 2-2 Task 5)
- [x] Existing tests must not regress at each plan completion (verify step)

### Git / Commits
- [x] Each task maps to one `feat`/`fix`/`chore` conventional commit
- [x] TECH_DEBT.md updates committed in same commit as fixes

---

## Risk Register

| Risk | Mitigation | Plan |
|---|---|---|
| TypeORM migrations break existing tests | Mock `DataSource` in test module providers | All plans |
| Plans 2-1 and 2-2 sequential conflict | Execute 2-1 before 2-2 (corrected above) | Execution order |
| Redis unavailable in CI | `RedisModule` graceful degradation; CI runs in-memory mode | 2-2 Task 1 |
| JWT secret missing in tests | Use `JWT_SECRET=test_secret` env var in test setup | 3-1 Task 1 |
| Docker not available in dev | SQLite fallback in DatabaseModule for local dev without Docker | 2-1 Task 1 |

---

## File Conflict Analysis

### No cross-plan conflicts (after enforcing 2-1 → 2-2 order):

| File | Plans that touch it | Resolution |
|---|---|---|
| `services/queue-manager.service.ts` | 2-1, 2-2, 3-1 | Sequential; each plan builds on prior result |
| `gateway/agent.gateway.ts` | 2-1, 2-2, 3-1 | Sequential |
| `services/pipeline-orchestrator.service.ts` | 2-1, 2-2 | Sequential |
| `app.module.ts` | 2-1, 2-2, 3-1 | Sequential; each adds new module imports |
| `TECH_DEBT.md` | 1-1, 3-1 | Wave 1 then Wave 3; no conflict |

---

## Summary

| Check | Status |
|---|---|
| All 23 v1 requirements covered | ✅ |
| Wave 1 includes debt task (api-server 10→0, workspace 167→119) | ✅ |
| Debt reduction ≥20% per project in Wave 1 | ✅ (api-server −100%, workspace −29%) |
| Full clearance of both projects by end of Phase 4 | ✅ (Wave 3 clears remaining 119) |
| No circular dependencies | ✅ |
| File conflicts identified and resolved | ✅ (enforce 2-1 before 2-2) |
| All plans follow project conventions | ✅ |
| Each task has concrete verification criteria | ✅ |
| Wave 1 is independent (no prerequisites) | ✅ |
