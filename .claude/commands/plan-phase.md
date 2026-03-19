# /plan-phase — Phase Planning Agent

Plan Phase $ARGUMENTS into atomic, executable task plans.

## Input

- Phase number from argument (e.g., `3`)
- Read `ROADMAP.md` for phase scope and deliverables
- Read `REQUIREMENTS.md` for detailed requirements
- Read `STATE.md` for active decisions and context
- Read `CLAUDE.md` for project conventions
- Read `TECH_DEBT.md` for the current pre-existing error baseline

## Process

### Step 1: Research

Investigate the current codebase to understand:
- Existing services, components, and modules that Phase $ARGUMENTS builds on
- Current API endpoints and data models
- Test patterns in use
- Any gaps between current state and phase requirements

Write findings to `.planning/phases/$ARGUMENTS/RESEARCH.md`.

### Step 1.5: Tech Debt Audit

Read `TECH_DEBT.md` and answer:

1. **Current baseline** — How many errors exist in `agent-workspace` and `api-server`?
2. **Categories to target** — Which rule categories are easiest to clear fully in one task? (Prefer categories where a single mechanical fix clears all instances — e.g. `prefer-const`, `no-case-declarations`.)
3. **Files touched by this phase** — Do any files in the Phase $ARGUMENTS feature scope also appear in TECH_DEBT.md? If so, clear their errors as part of implementing the feature (no separate task needed).
4. **Debt task scope** — Define a Wave 1 debt task that targets at least one full rule category clearance OR reduces total errors by ≥ 20% in at least one project. If both projects have zero errors, skip the debt task.

Record findings in `.planning/phases/$ARGUMENTS/RESEARCH.md` under a `## Tech Debt` section.

### Step 2: Decompose into Plans

Break the phase into **2-4 plans**, each targeting ~50% context window usage. Each plan should be a vertical slice (not a horizontal layer).

**Grouping strategy:**
- Group by user-facing feature, not by technical layer
- Each plan should be independently buildable and testable
- Plans execute in dependency order (wave-based)
- **Wave 1 MUST include a debt reduction task** (unless TECH_DEBT.md shows zero errors)

For each plan, create `.planning/phases/$ARGUMENTS/{wave}-{seq}-{name}-PLAN.md` with this structure:

```xml
<plan>
  <name>[descriptive name]</name>
  <wave>[1, 2, or 3 — dependency ordering]</wave>
  <requirements>[P3-xxx IDs this plan fulfills]</requirements>
  <files>
    [List every file this plan will create or modify]
  </files>
  <tasks>
    <task id="1">
      <name>[short name]</name>
      <action>[what to implement — be specific about Angular/NestJS patterns]</action>
      <files>[files touched by this task]</files>
      <verify>[how to verify — build, lint, test commands]</verify>
      <done>[concrete completion criteria, including target error counts if this is a debt task]</done>
    </task>
    <!-- 3-6 tasks per plan -->
  </tasks>
  <dependencies>
    [Plans that must complete before this one]
  </dependencies>
</plan>
```

**Debt task template** (include in Wave 1 plan when TECH_DEBT.md has errors):

```xml
<task id="1">
  <name>Clear pre-existing lint debt — [category names]</name>
  <action>
    Fix all instances of [rule name] in [files]. Mechanical changes only:
    [describe the fix pattern — e.g., "wrap case block bodies in {} braces"].
    Update TECH_DEBT.md: reduce count from X to Y, remove cleared files from affected-files table,
    add a row to the History table.
  </action>
  <files>[files from TECH_DEBT.md affected-files table for this category]</files>
  <verify>npx nx lint [project] — confirm error count drops to [target]</verify>
  <done>
    - [rule name] errors: [before] → [after]
    - Total [project] errors: [before] → [after]
    - TECH_DEBT.md updated with new baseline
    - No new errors introduced
  </done>
</task>
```

### Step 3: Verify Plan Coverage

Check that:
- [ ] Every v1 requirement in REQUIREMENTS.md maps to at least one plan
- [ ] Every plan has clear verification criteria
- [ ] No circular dependencies between plans
- [ ] File lists don't have unresolved conflicts between plans
- [ ] Plans follow project conventions (standalone components, feature modules, conventional commits)
- [ ] Wave 1 includes a debt reduction task (or TECH_DEBT.md shows zero errors — explain if skipped)

Write verification results to `.planning/phases/$ARGUMENTS/PLAN-VERIFICATION.md`.

## Conventions to Enforce

- Angular: Standalone components, `OnPush` change detection, `BehaviorSubject` state, `takeUntil` cleanup
- NestJS: Feature module organization, thin controllers, injectable services
- TypeScript: Strict mode, no `any`, interfaces for data structures
- Shared models: Import from `@nexus-queue/shared-models`
- Commits: `feat(scope): description` per task
- Tests: Vitest, co-located `.spec.ts` files

## Output

After creating all plan files, present a summary:

```
## Phase $ARGUMENTS Plan Summary

**Plans:** [count]
**Total Tasks:** [count]
**Requirements Covered:** [count]/[total v1]
**Debt Reduction Target:** agent-workspace [before → after], api-server [before → after]

### Execution Order

Wave 1 (parallel):
- [plan name] — [brief description] ([N] tasks, includes debt task)

Wave 2 (after wave 1):
- [plan name] — [brief description] ([N] tasks)

### How to Execute
Run plans in wave order:
- `/execute-task .planning/phases/$ARGUMENTS/1-1-name-PLAN.md`
```
