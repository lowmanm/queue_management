# /ship — Ship Phase

Create a PR for Phase $ARGUMENTS and update tracking documents.

## Prerequisites

Before shipping, confirm:
1. `.planning/phases/$ARGUMENTS/VERIFICATION.md` exists and shows PASS
2. All builds, lints, and tests pass
3. No uncommitted changes

If verification hasn't been run, prompt user to run `/verify-phase $ARGUMENTS` first.

## Process

### Step 1: Gather Context

1. Read `ROADMAP.md` for phase name and deliverables
2. Read `REQUIREMENTS.md` for requirements covered
3. Read all `*-SUMMARY.md` files in `.planning/phases/$ARGUMENTS/`
4. Read `.planning/phases/$ARGUMENTS/VERIFICATION.md`
5. Run `git log develop..HEAD --oneline` for all commits in this phase

### Step 2: Create PR

Use `gh pr create` with this structure:

```
Title: feat(<scope>): <Phase name> [NQ-xxx]

Body:
## Summary
[2-3 bullet points from ROADMAP.md deliverables]

## Changes
[Grouped by feature area, with file paths for significant changes]

## Requirements Covered
[List requirement IDs from REQUIREMENTS.md]

## Testing
- [ ] All unit tests pass (`nx test agent-workspace`, `nx test api-server`)
- [ ] Build succeeds (`nx build agent-workspace`, `nx build api-server`)
- [ ] Lint passes (`nx lint agent-workspace`, `nx lint api-server`)
- [ ] Manual testing: [list key user flows to test]

## Screenshots (if UI changes)
[placeholder for user to add]
```

### Step 3: Update Tracking

1. **ROADMAP.md** — Update phase status to "Complete" with ✅
2. **STATE.md** — Update current position to next phase, record what was shipped

### Step 4: Report

```
## Shipped Phase $ARGUMENTS

**PR:** [URL]
**Commits:** [count]
**Requirements:** [covered]/[total] v1

### Next Steps
- Review and merge PR
- Run `/plan-phase [next phase]` to continue
```
