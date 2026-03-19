# /verify-phase — Phase Verification Agent

Verify that Phase $ARGUMENTS achieves its stated goals, not just that tasks were completed.

## Process

### Step 1: Load Phase Context

1. Read `ROADMAP.md` for phase deliverables
2. Read `REQUIREMENTS.md` for v1 requirements
3. Read all plan files in `.planning/phases/$ARGUMENTS/`
4. Read all summary files in `.planning/phases/$ARGUMENTS/`

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

Record pass/fail for each.

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
| Check | Status |
|---|---|
| agent-workspace build | ✅/❌ |
| api-server build | ✅/❌ |
| agent-workspace lint | ✅/❌ |
| api-server lint (`eslint:lint`) | ✅/❌ |
| agent-workspace tests | ✅/❌ |
| api-server tests | ✅/❌ |

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
