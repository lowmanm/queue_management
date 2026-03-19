# /plan-phase — Phase Planning Agent

Plan Phase $ARGUMENTS into atomic, executable task plans.

## Input

- Phase number from argument (e.g., `3`)
- Read `ROADMAP.md` for phase scope and deliverables
- Read `REQUIREMENTS.md` for detailed requirements
- Read `STATE.md` for active decisions and context
- Read `CLAUDE.md` for project conventions

## Process

### Step 1: Research

Investigate the current codebase to understand:
- Existing services, components, and modules that Phase $ARGUMENTS builds on
- Current API endpoints and data models
- Test patterns in use
- Any gaps between current state and phase requirements

Write findings to `.planning/phases/$ARGUMENTS/RESEARCH.md`.

### Step 2: Decompose into Plans

Break the phase into **2-4 plans**, each targeting ~50% context window usage. Each plan should be a vertical slice (not a horizontal layer).

**Grouping strategy:**
- Group by user-facing feature, not by technical layer
- Each plan should be independently buildable and testable
- Plans execute in dependency order (wave-based)

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
      <done>[concrete completion criteria]</done>
    </task>
    <!-- 3-6 tasks per plan -->
  </tasks>
  <dependencies>
    [Plans that must complete before this one]
  </dependencies>
</plan>
```

### Step 3: Verify Plan Coverage

Check that:
- [ ] Every v1 requirement in REQUIREMENTS.md maps to at least one plan
- [ ] Every plan has clear verification criteria
- [ ] No circular dependencies between plans
- [ ] File lists don't have unresolved conflicts between plans
- [ ] Plans follow project conventions (standalone components, feature modules, conventional commits)

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

### Execution Order

Wave 1 (parallel):
- [plan name] — [brief description] ([N] tasks)

Wave 2 (after wave 1):
- [plan name] — [brief description] ([N] tasks)

### How to Execute
Run plans in wave order:
- `/execute-task .planning/phases/$ARGUMENTS/1-1-name-PLAN.md`
```
