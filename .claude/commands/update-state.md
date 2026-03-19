# /update-state — Save Session Context

Capture the current session's decisions, progress, and context into STATE.md so the next session can resume without loss.

## Process

### Step 1: Gather Current State

1. Read current `STATE.md`
2. Read `ROADMAP.md` for phase status
3. Run `git log --oneline -10` for recent commits
4. Run `git status` for uncommitted work
5. Check `.planning/phases/` for any in-progress plans

### Step 2: Update STATE.md

Update the following sections:

**Current Position:**
- Active phase and status (planning, executing, verifying, shipping)
- Last session date (today)
- Next action (what should happen when the project is reopened)

**What Just Happened:**
- Decisions made this session (with rationale)
- Files created or modified
- Tasks completed
- Any scope changes or discoveries

**Active Decisions & Context:**
- Design decisions that affect future work
- Trade-offs chosen and why
- Any "we'll do it this way because..." context

**Blockers:**
- Anything preventing progress
- Questions that need answers
- Dependencies on external work

**Project Health:**
- Build/lint/test status (run if unsure)
- Tech debt observations

### Step 3: Verify

After updating, read STATE.md back and confirm:
- [ ] A new developer reading only STATE.md would know exactly what to do next
- [ ] No decisions from this session are lost
- [ ] Blockers are clearly stated
- [ ] The "Next Action" is specific and actionable

### Output

```
## State Updated

**Session Date:** [today]
**Phase:** [current] — [status]
**Next Action:** [what to do next]
**Blockers:** [count]

STATE.md has been updated. Safe to archive this session.
```
