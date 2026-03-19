# /verify-phase — Phase Verification Agent

Verify that Phase $ARGUMENTS achieves its stated goals, not just that tasks were completed.

## Process

### Step 1: Load Phase Context

1. Read `ROADMAP.md` for phase deliverables
2. Read `REQUIREMENTS.md` for v1 requirements
3. Read all plan files in `.planning/phases/$ARGUMENTS/`
4. Read all summary files in `.planning/phases/$ARGUMENTS/`
5. Read `TECH_DEBT.md` for the pre-phase error baseline

### Step 2: Build & Test Verification

Run full project verification:

```bash
npx nx build agent-workspace
npx nx build api-server
npx nx lint agent-workspace
npx nx run api-server:eslint:lint
npx nx test agent-workspace
npx nx test api-server
```

Record pass/fail and **exact error counts** for each lint run.

### Step 2.5: Non-Regression & Debt Check

Compare actual lint error counts to the baseline in `TECH_DEBT.md`:

1. **Regression check** — If actual errors > baseline for either project, the phase has FAILED regardless of feature completeness. List every new error introduced, the file it's in, and the rule. These must be fixed before the phase can ship.

2. **Debt reduction check** — Did the phase include a debt reduction task? If yes, verify the error count dropped by the amount stated in the plan's `<done>` criteria. If the target wasn't met, list it as a gap.

3. **Baseline update** — If errors decreased from baseline, update `TECH_DEBT.md` now:
   - Reduce counts in the rule table
   - Remove files from the affected-files table that are now clean
   - Add a row to the History table: `Phase $ARGUMENTS | [date] | [new agent-workspace count] | [new api-server count] | [what was fixed]`

Report the delta clearly:
```
Tech Debt: agent-workspace 167 → 120 (-47 ✅), api-server 10 → 0 (-10 ✅)
```
Or if regression:
```
Tech Debt: agent-workspace 167 → 181 (+14 ❌ REGRESSION — 14 new errors in [files])
```

### Step 3: Requirement Coverage

For each v1 requirement in REQUIREMENTS.md for this phase:

| ID | Requirement | Status | Evidence |
|---|---|---|---|
| P3-xxx | [description] | ✅/❌ | [file path or explanation] |

Three verification levels per requirement:
1. **Artifact exists** — The file/component/service was created
2. **Substantive implementation** — Not a stub; real logic implemented
3. **Wired up** — Actually imported, routed, and accessible in the application

### Step 4: Integration Check

Verify cross-cutting concerns:
- [ ] New routes are registered in the routing config
- [ ] New components are accessible via navigation
- [ ] New API endpoints are callable from the frontend
- [ ] New shared models are exported from barrel
- [ ] Guards protect new routes appropriately
- [ ] WebSocket events (if any) follow naming convention

### Step 5: Write Verification Report

Create `.planning/phases/$ARGUMENTS/VERIFICATION.md`:

```
## Phase $ARGUMENTS Verification Report

**Date:** [date]
**Overall Status:** PASS / FAIL / PARTIAL

### Build & Test
| Check | Status | Notes |
|---|---|---|
| agent-workspace build | ✅/❌ | |
| api-server build | ✅/❌ | |
| agent-workspace lint | ✅/❌ | [X] errors ([baseline] → [actual], delta: [+/-N]) |
| api-server lint (`eslint:lint`) | ✅/❌ | [X] errors ([baseline] → [actual], delta: [+/-N]) |
| agent-workspace tests | ✅/❌ | |
| api-server tests | ✅/❌ | |

### Tech Debt
| Project | Baseline | Actual | Delta | Status |
|---|---|---|---|---|
| agent-workspace | [N] | [N] | [+/-N] | ✅ reduced / ✅ unchanged / ❌ regression |
| api-server | [N] | [N] | [+/-N] | ✅ reduced / ✅ unchanged / ❌ regression |

[If regression: list every new error by file, line, and rule]
[If reduced: confirm TECH_DEBT.md has been updated]

### Requirement Coverage
[table from Step 3]

**Coverage:** [X]/[Y] v1 requirements verified ([Z]%)

### Integration
[checklist from Step 4]

### Gaps
[list any gaps that need follow-up plans]

### Recommendation
[SHIP / FIX GAPS FIRST / NEEDS REWORK]
```

## If Gaps Are Found

For each gap, provide:
1. Which requirement is affected
2. What's missing (artifact, implementation, or wiring)
3. Suggested fix (brief)

Do NOT create fix plans — just report. The user will decide whether to run `/plan-phase $ARGUMENTS --gaps` or fix manually.

## Regression = Hard Block

If the non-regression check fails (new errors introduced), the recommendation MUST be **FIX GAPS FIRST** — do not recommend SHIP even if all feature requirements pass. List the exact files and rules to fix.
