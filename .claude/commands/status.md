# /status — Project Status Overview

Read the following files and present a concise status report:

1. `STATE.md` — Current position, last session, next action, blockers
2. `ROADMAP.md` — Phase completion status
3. Run `git log --oneline -10` for recent activity

## Output Format

```
## Project Status

**Phase:** [current phase name]
**Status:** [phase status]
**Last Session:** [date]

### Recent Activity
[last 5 git commits, one line each]

### Next Action
[from STATE.md]

### Blockers
[from STATE.md, or "None"]

### Quick Commands
- `/plan-phase 3` — Decompose Phase 3 into task plans
- `/execute-task <plan>` — Execute a specific plan
- `/verify-phase 3` — Run full verification
- `/update-state` — Save session context before ending
```

Keep the output short. Do NOT read any source code files — this is a status check only.
