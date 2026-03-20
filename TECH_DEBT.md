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

### `agent-workspace` — **0 errors** ✅

**Cleared:** Phase 4 Wave 3 (2026-03-20)

| Rule | Count | Fix Strategy |
|---|---|---|
| ~~`@angular-eslint/template/label-has-associated-control`~~ | ~~44~~ **0** | ✅ Cleared Phase 4 Wave 3 |
| ~~`@angular-eslint/template/interactive-supports-focus`~~ | ~~36~~ **0** | ✅ Cleared Phase 4 Wave 3 |
| ~~`@angular-eslint/template/click-events-have-key-events`~~ | ~~36~~ **0** | ✅ Cleared Phase 4 Wave 3 |
| ~~`@angular-eslint/template/prefer-control-flow`~~ | ~~29~~ **0** | ✅ Cleared Phase 4 Wave 1 |
| ~~`@angular-eslint/prefer-inject`~~ | ~~15~~ **0** | ✅ Cleared Phase 4 Wave 1 |
| ~~`@typescript-eslint/ban-ts-comment`~~ | ~~3~~ **0** | ✅ Cleared Phase 4 Wave 1 |
| ~~`@angular-eslint/no-output-native`~~ | ~~1~~ **0** | ✅ Cleared Phase 4 Wave 1 |

All pre-existing errors resolved. No affected files remaining.

---

### `api-server` — 0 errors ✅

**Cleared:** Phase 4 Wave 1 (2026-03-19)

All pre-existing errors resolved. No affected files remaining.

---

## History

| Phase | Date | agent-workspace errors | api-server errors | Action |
|---|---|---|---|---|
| Phase 3 (baseline set) | 2026-03-19 | 167 | 10 | Established register; 26 Phase 3 errors fixed before ship |
| Phase 4 Wave 1 (Task 2) | 2026-03-19 | 167 | 0 | Cleared `no-case-declarations` (9) + `prefer-const` (1) in api-server |
| Phase 4 Wave 1 (Tasks 3–4) | 2026-03-19 | 119 | 0 | Cleared `prefer-inject` (15) + `prefer-control-flow` (29) + `ban-ts-comment` (3) + `no-output-native` (1) in agent-workspace |
| Phase 4 Wave 3 (Task 5) | 2026-03-20 | 0 | 0 | Cleared `label-has-associated-control` (44) + `interactive-supports-focus` (36) + `click-events-have-key-events` (36) + `no-case-declarations` (3) in agent-workspace |

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
