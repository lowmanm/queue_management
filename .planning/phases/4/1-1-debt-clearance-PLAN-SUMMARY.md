## Execution Summary: 1-1-debt-clearance-PLAN

**Status:** Complete
**Tasks:** 4/4
**Date:** 2026-03-19

### Commits

| Hash | Message |
|---|---|
| `3b7dfbe` | feat(models): add AuditEvent and Auth shared model interfaces for Phase 4 |
| `59c5d67` | fix(api): clear pre-existing lint debt — no-case-declarations + prefer-const |
| `ca5e2d0` | fix(workspace): migrate constructor injection to inject() function |
| `740eb96` | fix(workspace): clear prefer-control-flow, ban-ts-comment, no-output-native lint debt |

### What Was Built

- **AuditEvent interface** — `AuditEvent`, `AuditEventType`, `AggregateType`, `AuditLogQuery`, `AuditLogResponse` for Phase 4 event sourcing
- **Auth interface** — `LoginRequest`, `LoginResponse`, `RefreshRequest`, `JwtPayload`, `TokenPair` for Phase 4 real authentication
- **api-server lint clearance** — 10 errors eliminated (9 `no-case-declarations` + 1 `prefer-const`)
- **agent-workspace prefer-inject clearance** — 15 errors eliminated; 7 services/components migrated to `inject()` function pattern
- **agent-workspace prefer-control-flow clearance** — 29 errors eliminated; 12 HTML templates + 1 inline template migrated to `@if`/`@for`
- **agent-workspace ban-ts-comment clearance** — 3 stale `@ts-ignore` comments removed
- **agent-workspace no-output-native clearance** — `@Output() close` renamed to `@Output() panelClose`

### Files Created

- `libs/shared-models/src/lib/audit-event.interface.ts`
- `libs/shared-models/src/lib/auth.interface.ts`

### Files Modified

**shared-models:**
- `libs/shared-models/src/index.ts` — barrel export for 2 new interfaces

**api-server:**
- `apps/api-server/src/app/routing/routing.service.ts`
- `apps/api-server/src/app/tasks/tasks.service.ts`
- `apps/api-server/src/app/volume-loader/volume-loader.service.ts`

**agent-workspace (TypeScript):**
- `apps/agent-workspace/src/app/core/services/disposition.service.ts`
- `apps/agent-workspace/src/app/core/services/queue.service.ts`
- `apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.ts`
- `apps/agent-workspace/src/app/features/workspace/components/header/header.component.ts`
- `apps/agent-workspace/src/app/features/workspace/components/main-stage/main-stage.component.ts`
- `apps/agent-workspace/src/app/features/workspace/components/sidebar/sidebar.component.ts`
- `apps/agent-workspace/src/app/features/workspace/workspace.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.ts`
- `apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/dispositions/dispositions.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/skills/skills.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/users/users.component.ts`
- `apps/agent-workspace/src/app/features/admin/components/work-states/work-states.component.ts`
- `apps/agent-workspace/src/app/features/manager/components/skill-assignments/skill-assignments.component.ts`
- `apps/agent-workspace/src/app/shared/components/layout/page-layout.component.ts`

**agent-workspace (HTML templates):**
- `apps/agent-workspace/src/app/features/admin/components/dispositions/dispositions.component.html`
- `apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html`
- `apps/agent-workspace/src/app/features/admin/components/skills/skills.component.html`
- `apps/agent-workspace/src/app/features/admin/components/users/users.component.html`
- `apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.html`
- `apps/agent-workspace/src/app/features/admin/components/work-states/work-states.component.html`
- `apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.html`
- `apps/agent-workspace/src/app/features/manager/components/skill-assignments/skill-assignments.component.html`
- `apps/agent-workspace/src/app/features/manager/components/team-dashboard/team-dashboard.component.html`
- `apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.html`
- `apps/agent-workspace/src/app/features/workspace/components/agent-stats/agent-stats.component.html`
- `apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.html`
- `apps/agent-workspace/src/app/features/workspace/workspace.component.html`

**Tracking:**
- `TECH_DEBT.md`

### Tech Debt

- **agent-workspace:** 167 → 119 (−48, −29%)
  - `prefer-inject`: 15 → 0 ✅
  - `prefer-control-flow`: 29 → 0 ✅
  - `ban-ts-comment`: 3 → 0 ✅
  - `no-output-native`: 1 → 0 ✅
  - Remaining: 44 `label-has-associated-control` + 36 `interactive-supports-focus` + 36 `click-events-have-key-events` (accessibility, deferred to Wave 3)
- **api-server:** 10 → 0 ✅ (fully cleared)

### Issues Encountered

- `npx nx` was unavailable globally; resolved by using `./node_modules/.bin/nx` throughout
- `libs/shared-models/src/lib/index.ts` does not exist — barrel is at `libs/shared-models/src/index.ts`
- `page-layout.component.ts` inline template was missed by sub-agent HTML migration pass; fixed manually
- 5 companion `.ts` files had `CommonModule` removed by sub-agent (correct — no longer needed post-migration)
- `@ts-ignore` comments in `volume-loader.component.ts` were stale (guarding `pipelineId` which already exists in the interface)
