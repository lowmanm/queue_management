# Nexus Queue — Tech Debt Register

> **Canonical tracker for pre-existing lint errors and code quality debt.**
> Updated by `/verify-phase` (non-regression check) and `/execute-task` (when debt is cleared).
> Agents MUST read this file during `/plan-phase` and include a debt reduction task in every phase plan.

---

## Policy

- **Non-regression:** A phase MUST NOT increase the error count in either project above the baseline recorded here. `/verify-phase` enforces this.
- **Proactive reduction:** Every phase plan MUST include at least one debt reduction task targeting a full category clearance or ≥ 20% total reduction per project.
- **Baseline update:** When errors are fixed, update the counts in this file as part of the commit that clears them. Do NOT defer the update.
- **New errors:** If new code introduces errors not in this register, fix them before committing (per `/execute-task` error handling). If they cannot be fixed in the same task, add them here immediately with the phase and date they were introduced.

---

## Baseline — Established Phase 3 (2026-03-19)

### `agent-workspace` — 167 errors

**Target phase for full clearance:** Phase 4

| Rule | Count | Fix Strategy |
|---|---|---|
| `@angular-eslint/template/label-has-associated-control` | 44 | Add `for`/`id` wiring to all unassociated form labels |
| `@angular-eslint/template/interactive-supports-focus` | 36 | Add `tabindex="0"` + `role` to interactive non-button elements |
| `@angular-eslint/template/click-events-have-key-events` | 36 | Add `keydown.enter`/`keydown.space` handlers alongside `click` |
| `@angular-eslint/template/prefer-control-flow` | 29 | Migrate `*ngIf`/`*ngFor` directives to `@if`/`@for` blocks |
| `@angular-eslint/prefer-inject` | 15 | Migrate constructor injection to `inject()` function |
| `@typescript-eslint/ban-ts-comment` | 3 | Remove `@ts-ignore` — fix underlying type errors instead |
| `@angular-eslint/no-output-native` | 1 | Rename output property to avoid native DOM event name collision |

**Affected files (29):**

| File | Phase Introduced |
|---|---|
| `apps/agent-workspace/src/app/core/services/agent-stats.service.ts` | Phase 2.5 |
| `apps/agent-workspace/src/app/core/services/disposition.service.ts` | Phase 2.5 |
| `apps/agent-workspace/src/app/core/services/manager-api.service.ts` | Phase 2.5 |
| `apps/agent-workspace/src/app/core/services/queue.service.ts` | Phase 2.5 |
| `apps/agent-workspace/src/app/core/services/socket.service.ts` | Phase 2.5 |
| `apps/agent-workspace/src/app/features/admin/components/dispositions/dispositions.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/admin/components/rule-builder/rule-builder.component.spec.ts` | Phase 3 |
| `apps/agent-workspace/src/app/features/admin/components/skills/skills.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/admin/components/users/users.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/admin/components/users/users.component.ts` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.ts` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/admin/components/work-states/work-states.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/manager/components/skill-assignments/skill-assignments.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/manager/components/team-dashboard/team-dashboard.component.html` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/manager/components/team-dashboard/team-dashboard.component.ts` | Phase 2.5b |
| `apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.html` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/components/action-bar/action-bar.component.ts` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/components/agent-stats/agent-stats.component.html` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/components/agent-stats/agent-stats.component.ts` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/components/header/header.component.ts` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.html` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/components/log-viewer/log-viewer.component.ts` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/components/main-stage/main-stage.component.ts` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/components/sidebar/sidebar.component.ts` | Phase 2 |
| `apps/agent-workspace/src/app/features/workspace/workspace.component.ts` | Phase 2 |
| `apps/agent-workspace/src/app/shared/components/layout/page-layout.component.ts` | Phase 2 |

---

### `api-server` — 10 errors

**Target phase for full clearance:** Phase 4

| Rule | Count | Fix Strategy |
|---|---|---|
| `no-case-declarations` | 9 | Wrap `case` block bodies in `{}` braces to create block scope |
| `prefer-const` | 1 | Change `let eligible` to `const eligible` |

**Affected files:**

| File | Errors | Lines | Phase Introduced |
|---|---|---|---|
| `apps/api-server/src/app/routing/routing.service.ts` | 3 | 392 (`prefer-const`), 471–472 (`no-case-declarations`) | Phase 2.5b |
| `apps/api-server/src/app/tasks/tasks.service.ts` | 1 | 124 (`no-case-declarations`) | Phase 2.5b |
| `apps/api-server/src/app/volume-loader/volume-loader.service.ts` | 6 | 1292, 1295, 1302, 1308, 1309, 1315 (`no-case-declarations`) | Phase 2.5b |

---

## History

| Phase | Date | agent-workspace errors | api-server errors | Action |
|---|---|---|---|---|
| Phase 3 (baseline set) | 2026-03-19 | 167 | 10 | Established register; 26 Phase 3 errors fixed before ship |
| Phase 4 | TBD | — | — | Target: full clearance of both |

---

## How Agents Use This File

### During `/plan-phase N`
1. Read this file in the Research step
2. Include a **Wave 1 debt task** that targets at least one full rule category or ≥ 20% total reduction
3. State the target post-phase error counts in the plan's `<done>` criteria

### During `/execute-task`
1. When a task fixes pre-existing errors, update the counts in this file
2. Remove files from the affected-files table once all their errors are cleared
3. Add a row to the History table with the new counts
4. Commit the TECH_DEBT.md update in the same commit as the fixes

### During `/verify-phase N`
1. Run lint for both projects and record actual error counts
2. Compare to baseline — if counts increased, FAIL the verification (regression)
3. If counts decreased, update this file with the new baseline
4. Report delta: `agent-workspace: 167 → 120 (-47)`, `api-server: 10 → 0 (-10)`
