# /execute-task — Task Execution Agent

Execute the plan file at path: $ARGUMENTS

## Process

### Step 1: Load Context

1. Read the plan file specified in the argument
2. Read `CLAUDE.md` for project conventions
3. Read `STATE.md` for active decisions
4. Read any dependency plans referenced (confirm they're complete)

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
5. **Commit** — Create an atomic commit with conventional commit message:
   ```
   <type>(<scope>): <description>
   ```
6. **Confirm** — Check `<done>` criteria are met

### Step 3: Post-Execution

After all tasks complete:

1. Run full project verification:
   ```bash
   npx nx build agent-workspace
   npx nx build api-server
   npx nx lint agent-workspace
   npx nx lint api-server
   npx nx test agent-workspace
   npx nx test api-server
   ```
2. Write execution summary to `.planning/phases/[phase]/[plan-name]-SUMMARY.md`:
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

   ### Issues Encountered
   [any problems and how they were resolved]
   ```

## Error Handling

- **Build failure:** Read error, fix, rebuild. Do NOT skip verification.
- **Lint failure:** Fix lint errors. Do NOT disable rules.
- **Test failure:** Fix failing tests. If test expectations are wrong (due to new behavior), update the test.
- **Architectural issue:** If you discover the plan's approach won't work, STOP and explain the issue. Do NOT silently deviate from the plan.
- **After 3 failed fix attempts:** Escalate to user with diagnosis.

## Important

- Each task gets its own git commit — never batch multiple tasks into one commit
- Never use `--no-verify` on commits
- Never modify files outside the plan's `<files>` list without explaining why
- If a task creates shared models, update the barrel export in `libs/shared-models/src/lib/index.ts`
