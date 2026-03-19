# /execute-task — Task Execution Agent

Execute the plan file at path: $ARGUMENTS

## Process

### Step 1: Load Context

1. Read the plan file specified in the argument
2. Read `CLAUDE.md` for project conventions
3. Read `STATE.md` for active decisions
4. Read `TECH_DEBT.md` for the current error baseline
5. Read any dependency plans referenced (confirm they're complete)

### Step 2: Execute Tasks Sequentially

For each `<task>` in the plan:

1. **Announce** — Print task name and what you're about to do
2. **Implement** — Write the code following project conventions:
   - Angular: Standalone components, `OnPush`, `BehaviorSubject`, `takeUntil`, import order
   - NestJS: Feature modules, thin controllers, service injection
   - TypeScript: Strict mode, interfaces from `@nexus-queue/shared-models`
   - No `any`, no `console.log`, no commented-out code, no hardcoded values
3. **Verify** — Run the verification command from `<verify>` (build, lint, test)
4. **Fix** — If verification fails, fix the issue. Max 3 fix attempts before escalating
5. **Debt check** — After lint runs, compare error count to TECH_DEBT.md baseline:
   - If count **increased**: stop, fix all new errors before committing. New errors in new code are never acceptable
   - If count **decreased**: note the delta — TECH_DEBT.md will be updated in Post-Execution
   - If count **unchanged**: proceed normally
6. **Commit** — Create an atomic commit with conventional commit message:
   ```
   <type>(<scope>): <description>
   ```
7. **Confirm** — Check `<done>` criteria are met

### Step 3: Post-Execution

After all tasks complete:

1. Run full project verification:
   ```bash
   npx nx build agent-workspace
   npx nx build api-server
   npx nx lint agent-workspace
   npx nx run api-server:eslint:lint
   npx nx test agent-workspace
   npx nx test api-server
   ```

2. **Update TECH_DEBT.md** if errors were reduced:
   - Lower the count for any rule categories that were cleared or reduced
   - Remove files from the affected-files table that now have zero errors
   - Add a row to the History table:
     ```
     | [Plan name] | [date] | [new agent-workspace count] | [new api-server count] | [what was fixed] |
     ```
   - Commit the TECH_DEBT.md update in the same commit as the last task, or as a separate `chore(debt): update TECH_DEBT.md baseline` commit

3. Write execution summary to `.planning/phases/[phase]/[plan-name]-SUMMARY.md`:
   ```
   ## Execution Summary: [plan name]

   **Status:** Complete / Partial
   **Tasks:** [completed]/[total]
   **Commits:** [list of commit hashes and messages]

   ### What Was Built
   [bullet list of deliverables]

   ### Files Created
   [list]

   ### Files Modified
   [list]

   ### Tech Debt
   - agent-workspace: [baseline] → [actual] ([delta])
   - api-server: [baseline] → [actual] ([delta])
   [If reduced: which rules/files were cleared]
   [If unchanged: note]

   ### Issues Encountered
   [any problems and how they were resolved]
   ```

4. Update `STATE.md` mid-phase progress — do NOT rewrite the whole file, only update these two fields:
   - **Current Position → Phase Status**: reflect that this plan is done (e.g. "In Progress — Wave 1 complete, Wave 2 next")
   - **Current Position → Next Action**: set to the next plan to execute, or `/verify-phase N` if all plans are done
   - If STATE.md has a phase progress table, mark this plan ✅

   This ensures the session can be safely interrupted between waves without losing position.

## Error Handling

- **Build failure:** Read error, fix, rebuild. Do NOT skip verification.
- **Lint failure (new errors):** Fix lint errors introduced by this task. Do NOT disable rules. Do NOT commit with more errors than the TECH_DEBT.md baseline.
- **Lint failure (pre-existing errors):** If errors are pre-existing (in TECH_DEBT.md), they do not block the commit — but the count must not have increased.
- **Test failure:** Fix failing tests. If test expectations are wrong (due to new behavior), update the test.
- **Architectural issue:** If you discover the plan's approach won't work, STOP and explain the issue. Do NOT silently deviate from the plan.
- **After 3 failed fix attempts:** Escalate to user with diagnosis.

## Important

- Each task gets its own git commit — never batch multiple tasks into one commit
- Never use `--no-verify` on commits
- Never modify files outside the plan's `<files>` list without explaining why
- If a task creates shared models, update the barrel export in `libs/shared-models/src/lib/index.ts`
- **Never allow a task to land that increases the lint error count above the TECH_DEBT.md baseline**
