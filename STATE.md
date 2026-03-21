# Nexus Queue — Session State

> **Read this first when returning to the project.**
> This file captures current position, active decisions, blockers, and session context.

---

## Current Position

| Field | Value |
|---|---|
| **Active Phase** | Phase 6 — Platform Hardening |
| **Phase Status** | In Progress — Wave 1 complete, Wave 2 complete (`2-1` and `2-2` done) |
| **Last Session** | 2026-03-21 |
| **Next Action** | `/verify-phase 6` to run full verification, then `/ship 6` |

---

## What Just Happened (Session: 2026-03-20)

### Phase 5 — External Integrations & Advanced Routing — SHIPPED ✅

All 19 v1 requirements implemented, verified, and PR branch pushed.

**PR branch:** `claude/verify-phase-5-XinDF` → `develop`
**Verification:** `.planning/phases/5/VERIFICATION.md` — 19/19 requirements covered

### What Was Delivered

| Deliverable | Status |
|---|---|
| Webhook Ingestion Gateway (`POST /api/webhooks/{token}`, HMAC-SHA256) | ✅ |
| `WebhooksService` — in-memory endpoint store, token management, delivery log | ✅ |
| `WebhooksComponent` at `/admin/webhooks` with endpoint CRUD + delivery log panel | ✅ |
| Outbound webhooks — `OutboundWebhookService` with 3-retry backoff, EventStore logging | ✅ |
| Pipeline wizard Callbacks step (callbackUrl + callbackEvents) | ✅ |
| Cross-pipeline routing in `PipelineOrchestratorService` (`MAX_PIPELINE_HOPS=3`) | ✅ |
| `task.pipeline_transferred` event, DLQ on hop limit exceeded | ✅ |
| Pipeline wizard routing rule editor — "Transfer to Pipeline" action type | ✅ |
| `PipelineService.exportPipeline` / `importPipeline` / `clonePipeline` backend | ✅ |
| `PipelinePortabilityComponent` — export download, import file upload, clone | ✅ |
| Pipeline list — Export JSON, Clone, Import Pipeline actions | ✅ |

### Decisions Made This Phase

| Decision | Rationale |
|---|---|
| In-memory store for webhook endpoints (no TypeORM entity yet) | Consistent with other Phase 5 services; TypeORM upgrade is Phase 6 |
| `timingSafeEqual` for HMAC comparison | Prevents timing attacks on webhook verification |
| `@Public()` on `POST /api/webhooks/:token` | Endpoint secured by HMAC token, not JWT |
| `POST import` declared before `POST :id/clone` in controller | Prevents NestJS matching "import" as an `:id` segment |
| Export uses queue names (not IDs) in PipelineBundle | Makes bundles portable across environments |

---

## Phase 4 — Persistence + Production — SHIPPED ✅

All 23 v1 requirements implemented, verified, and PR branch pushed.

**PR branch:** `claude/add-status-endpoint-dLDyi` → `develop`
**Verification:** `.planning/phases/4/PLAN-VERIFICATION.md` — 23/23 requirements covered

### What Was Delivered

| Deliverable | Status |
|---|---|
| TypeORM DatabaseModule (SQLite/PostgreSQL dual-mode) | ✅ |
| 17 TypeORM entities + InitialSchema migration + seed script | ✅ |
| All 8 services migrated to TypeORM repositories | ✅ |
| RedisModule with graceful fallback (no-ops when REDIS_URL absent) | ✅ |
| AgentManagerService + AgentSessionService → Redis write-through cache | ✅ |
| TaskDistributorService → Redis pub/sub (`nexus:task:distribute`) | ✅ |
| EventStoreService + `task_events` append-only table | ✅ |
| 11 domain events across full task lifecycle | ✅ |
| `GET /api/audit-log` paginated + filtered | ✅ |
| AuditLogComponent at `/admin/audit-log` (adminGuard) | ✅ |
| JWT AuthModule (bcrypt, 15m/7d tokens), JwtAuthGuard globally applied | ✅ |
| Frontend AuthService: real login, localStorage JWT, auto-refresh | ✅ |
| Prometheus metrics: 6 custom `nexus_*` metrics at `GET /api/metrics` | ✅ |
| `GET /api/health` via @nestjs/terminus | ✅ |
| Multi-stage Dockerfiles (api + nginx), docker-compose.yml | ✅ |
| agent-workspace accessibility debt cleared: 119 → 0 errors | ✅ |

### Decisions Made This Phase

| Decision | Rationale |
|---|---|
| SQLite in dev, PostgreSQL in prod | Zero local Docker requirement for development |
| Write-through cache for AgentManagerService (sync reads, async writes) | Prevents breaking existing sync callers during Redis migration |
| `APP_GUARD` provider for JwtAuthGuard (not `app.useGlobalGuards()`) | Enables proper NestJS DI for `@Public()` decorator resolution |
| `@Public()` opt-out vs `@UseGuards()` opt-in | Fewer changes to existing controllers; open endpoints are the exception |
| prom-client directly (not @willsoto/nestjs-prometheus) | Simpler; metrics service already injectable without extra boilerplate |

---

## Phase 3 — Complete

| Wave | Plan | Status |
|---|---|---|
| Wave 1 | `1-1-backend-extensions-PLAN.md` | ✅ Complete |
| Wave 2 | `2-1-pipeline-wizard-queue-config-PLAN.md` | ✅ Complete |
| Wave 2 | `2-2-rule-builder-ui-PLAN.md` | ✅ Complete |
| Wave 2 | `2-3-dlq-monitor-pipeline-status-PLAN.md` | ✅ Complete |

---

## Phase 4 — Complete ✅

| Wave | Plan | Status |
|---|---|---|
| Wave 1 | `1-1-debt-clearance-PLAN.md` | ✅ Complete |
| Wave 2a | `2-1-postgresql-persistence-PLAN.md` | ✅ Complete |
| Wave 2b | `2-2-redis-event-sourcing-PLAN.md` | ✅ Complete |
| Wave 3 | `3-1-auth-monitoring-deploy-PLAN.md` | ✅ Complete |

---

## Phase 5 — Complete ✅

| Wave | Plan | Status |
|---|---|---|
| Wave 1 | `1-1-backend-integration-core-PLAN.md` | ✅ Complete |
| Wave 2 | `2-1-webhook-ui-PLAN.md` | ✅ Complete |
| Wave 2 | `2-2-pipeline-portability-PLAN.md` | ✅ Complete |

---

## Active Decisions & Context

| Decision | Rationale |
|---|---|
| `npx nx lint api-server` — correct target is `npx nx run api-server:eslint:lint` | The short `lint` alias does not exist for api-server |
| ~167 pre-existing lint errors in `agent-workspace` | From Phase 2 and earlier; not introduced by Phase 3; address during Phase 4 refactor |
| 10 pre-existing lint errors in `api-server` | In `routing.service.ts` and `tasks.service.ts`; document in Phase 4 scope |

---

## Blockers

None currently.

---

## Project Health

| Metric | Status |
|---|---|
| Build | ✅ Passing |
| Lint | ✅ 0 errors (agent-workspace cleared 119→0 in Phase 4 Wave 3) |
| Tests | ✅ 95 + 31 = 126 tests passing |
| Tech Debt | agent-workspace **0** ✅; api-server 0 ✅ (both fully cleared) |

---

## How to Use This File

1. **Returning to project** → Read "Current Position" and "Next Action"
2. **Starting a session** → Run `/status` to get a formatted summary
3. **Ending a session** → Run `/update-state` to capture decisions and progress
4. **Context too stale** → Check ROADMAP.md for phase status, REQUIREMENTS.md for scope

---

*Last Updated: 2026-03-20 (Phase 5 shipped — PR open on claude/verify-phase-5-XinDF → develop)*
