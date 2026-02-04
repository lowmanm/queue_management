# Nexus Queue - AI Agent Guidelines

This document serves as the **master checklist** for AI agents assisting with the design, strategy, development, and implementation of the Nexus Queue system.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Before Starting Any Task](#2-before-starting-any-task)
3. [Development Standards](#3-development-standards)
4. [Architecture Guidelines](#4-architecture-guidelines)
5. [Git & Branching Checklist](#5-git--branching-checklist)
6. [Code Patterns & Conventions](#6-code-patterns--conventions)
7. [Testing Requirements](#7-testing-requirements)
8. [Documentation Updates](#8-documentation-updates)
9. [Pre-Commit Checklist](#9-pre-commit-checklist)
10. [PR Submission Checklist](#10-pr-submission-checklist)

---

## 1. Quick Reference

### Project Structure
```
nexus-queue/
├── apps/
│   ├── agent-workspace/     # Angular 17+ frontend
│   └── api-server/          # NestJS backend
├── libs/
│   └── shared-models/       # Shared TypeScript interfaces
├── ARCHITECTURE.md          # System design & vision
├── BRANCH_STRATEGY.md       # Git workflow & conventions
└── AGENT.md                 # This file
```

### Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Angular | 17+ |
| Backend | NestJS | Latest |
| Real-time | Socket.io | Latest |
| Monorepo | Nx | Latest |
| Styling | SCSS | - |
| Language | TypeScript | Strict mode |

### Key Commands
```bash
# Build
npx nx build agent-workspace
npx nx build api-server

# Serve (development)
npx nx serve agent-workspace
npx nx serve api-server

# Test
npx nx test agent-workspace
npx nx test api-server

# Lint
npx nx lint agent-workspace
npx nx lint api-server

# Build affected
npx nx affected:build
npx nx affected:test
```

---

## 2. Before Starting Any Task

### Initial Context Gathering

- [ ] **Read ARCHITECTURE.md** - Understand current system design
- [ ] **Read BRANCH_STRATEGY.md** - Understand git workflow
- [ ] **Check current branch** - Ensure on correct feature branch
- [ ] **Pull latest changes** - `git pull origin develop`
- [ ] **Review related files** - Read before modifying any code

### Task Classification

Determine the task type to apply correct workflow:

| Task Type | Branch From | Branch Pattern | Merges To |
|-----------|-------------|----------------|-----------|
| New Feature | `develop` | `feature/NQ-xxx-description` | `develop` |
| Bug Fix | `develop` | `bugfix/NQ-xxx-description` | `develop` |
| Hotfix | `main` | `hotfix/NQ-xxx-description` | `main` + `develop` |
| Documentation | `develop` | `docs/description` | `develop` |

### Scope Assessment

Before implementing, assess if changes affect:

- [ ] **Shared Models** (`libs/shared-models`) - Will require rebuild of dependent apps
- [ ] **API Contracts** - Frontend/backend sync required
- [ ] **State Machine** - Agent state flow changes
- [ ] **WebSocket Events** - Both ends need updates
- [ ] **Architecture** - ARCHITECTURE.md update required

---

## 3. Development Standards

### TypeScript Standards

```typescript
// ALWAYS use strict typing - no 'any' unless absolutely necessary
// ALWAYS use interfaces for data structures
// ALWAYS use enums or union types for fixed values

// Good
interface TaskData {
  id: string;
  status: TaskStatus;
  priority: number;
}

// Bad
const taskData: any = { ... };
```

### Angular Standards (Frontend)

| Requirement | Standard |
|-------------|----------|
| Components | Standalone components only |
| State Management | BehaviorSubject in services |
| Dependency Injection | `providedIn: 'root'` for singleton services |
| Change Detection | OnPush where applicable |
| Lifecycle | Implement OnDestroy, use takeUntil pattern |
| Imports | Group: Angular, Third-party, Local |

```typescript
// Service pattern
@Injectable({ providedIn: 'root' })
export class ExampleService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private dataSubject = new BehaviorSubject<Data | null>(null);

  public data$ = this.dataSubject.asObservable();

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

### NestJS Standards (Backend)

| Requirement | Standard |
|-------------|----------|
| Modules | Feature-based module organization |
| Controllers | Thin controllers, business logic in services |
| Services | Injectable, single responsibility |
| DTOs | Use class-validator for validation |
| Error Handling | Use NestJS exception filters |

```typescript
// Module organization
apps/api-server/src/app/
├── gateway/           # WebSocket gateway
│   ├── gateway.module.ts
│   └── agent.gateway.ts
├── services/          # Shared services
│   ├── services.module.ts
│   └── *.service.ts
└── tasks/             # Feature module
    ├── tasks.module.ts
    ├── tasks.controller.ts
    └── tasks.service.ts
```

### Shared Models Standards

| Requirement | Standard |
|-------------|----------|
| Location | `libs/shared-models/src/lib/` |
| Naming | `*.interface.ts` for interfaces |
| Exports | Re-export via `index.ts` |
| Documentation | JSDoc comments on all interfaces |

```typescript
/**
 * Represents a task in the queue management system.
 * @description Used by both frontend and backend
 */
export interface Task {
  /** Unique identifier for the task */
  id: string;
  // ... more properties with JSDoc
}
```

---

## 4. Architecture Guidelines

### When to Update ARCHITECTURE.md

Update ARCHITECTURE.md when ANY of the following occur:

- [ ] New component/module added to system
- [ ] Tech stack changes (new library, version upgrade)
- [ ] State machine modifications
- [ ] API contract changes
- [ ] New integration points
- [ ] Phase/roadmap updates
- [ ] Project structure changes

### Architecture Change Process

1. **Propose** - Describe the change before implementing
2. **Get Approval** - Wait for user confirmation
3. **Implement** - Make the code changes
4. **Document** - Update ARCHITECTURE.md immediately
5. **Verify** - Ensure documentation matches implementation

### Component Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                     Agent Workspace                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Header: Agent info, state display, session controls   │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌─────────────┐  ┌──────────────────────────────────────┐  │
│  │   Sidebar   │  │            Main Stage                 │  │
│  │  Task info  │  │     (iFrame - Source Application)    │  │
│  │  Metadata   │  │                                      │  │
│  └─────────────┘  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Action Bar: Accept, Reject, Complete, Transfer, etc.  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### State Machine (Source of Truth)

```
┌──────────┐    Task Pushed    ┌──────────┐    Accept    ┌──────────┐
│  IDLE    │──────────────────▶│ RESERVED │─────────────▶│  ACTIVE  │
│          │                   │          │              │          │
└──────────┘                   └──────────┘              └──────────┘
     ▲                              │                         │
     │                              │ Timeout/Reject          │ Complete
     │                              ▼                         ▼
     │                         ┌──────────┐             ┌──────────┐
     │                         │   IDLE   │             │ WRAP_UP  │
     │                         └──────────┘             └──────────┘
     │                                                       │
     │              Disposition Complete                     │
     └───────────────────────────────────────────────────────┘

     ┌──────────┐
     │ OFFLINE  │  (Disconnected / Not logged in)
     └──────────┘
```

**Valid Transitions:**
| From | To | Trigger |
|------|-----|---------|
| OFFLINE | IDLE | WebSocket connected |
| IDLE | RESERVED | Task assigned |
| RESERVED | ACTIVE | Agent accepts |
| RESERVED | IDLE | Agent rejects / Timeout |
| ACTIVE | WRAP_UP | Agent completes work |
| ACTIVE | IDLE | Agent transfers |
| WRAP_UP | IDLE | Disposition submitted |
| ANY | OFFLINE | Disconnect / Logout |

---

## 5. Git & Branching Checklist

### Starting New Work

- [ ] Checkout `develop`: `git checkout develop`
- [ ] Pull latest: `git pull origin develop`
- [ ] Create feature branch: `git checkout -b feature/NQ-xxx-description`
- [ ] Verify branch name follows convention

### During Development

- [ ] Commit frequently with conventional commits
- [ ] Keep commits focused and atomic
- [ ] Use correct commit type and scope

### Commit Message Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

**Scopes:** `workspace`, `api`, `gateway`, `models`, `auth`, `queue`, `stage`, `actions`

**Examples:**
```bash
feat(gateway): add automatic reconnection logic
fix(workspace): resolve header overflow on mobile
docs(models): add JSDoc comments to Task interface
refactor(queue): extract state machine to separate service
```

### Before Committing

- [ ] Run lint: `npx nx lint <project>`
- [ ] Run tests: `npx nx test <project>`
- [ ] Run build: `npx nx build <project>`
- [ ] Review all staged changes
- [ ] Ensure no secrets/credentials in code
- [ ] Ensure no `console.log` in production code (use proper logging)

### Before Creating PR

- [ ] Rebase on latest develop: `git fetch origin develop && git rebase origin/develop`
- [ ] Resolve any conflicts
- [ ] Push to remote: `git push -u origin <branch-name>`
- [ ] **GET USER APPROVAL** before executing git operations

---

## 6. Code Patterns & Conventions

### File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Component | `kebab-case.component.ts` | `header.component.ts` |
| Service | `kebab-case.service.ts` | `queue.service.ts` |
| Interface | `kebab-case.interface.ts` | `task.interface.ts` |
| Module | `kebab-case.module.ts` | `gateway.module.ts` |
| Guard | `kebab-case.guard.ts` | `auth.guard.ts` |

### Import Order

```typescript
// 1. Angular/NestJS core
import { Injectable, OnDestroy } from '@angular/core';

// 2. Third-party libraries
import { BehaviorSubject, Observable, Subject } from 'rxjs';

// 3. Shared libraries (monorepo)
import { Task, AgentState } from '@nexus-queue/shared-models';

// 4. Local/relative imports
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
```

### Observable Naming

```typescript
// Private subjects end with 'Subject'
private dataSubject = new BehaviorSubject<Data | null>(null);

// Public observables end with '$'
public data$ = this.dataSubject.asObservable();

// Subscriptions (if stored) end with '$' or 'Subscription'
private timer$: Subscription | null = null;
```

### Error Handling

```typescript
// Services: Throw descriptive errors
if (this.agentState !== 'IDLE') {
  throw new Error(`Cannot get next task: Agent is in ${this.agentState} state`);
}

// Components: Catch and display user-friendly messages
this.queueService.getNextTask().subscribe({
  next: (task) => { /* handle success */ },
  error: (err) => {
    console.error('Failed to get task:', err);
    // Show user-friendly notification
  }
});
```

### WebSocket Event Naming

| Direction | Pattern | Example |
|-----------|---------|---------|
| Client → Server | `verb:noun` | `agent:ready`, `task:accept` |
| Server → Client | `noun:event` | `task:assigned`, `connection:ack` |

---

## 7. Testing Requirements

### Minimum Testing Standards

| Type | Requirement |
|------|-------------|
| Unit Tests | All services must have unit tests |
| Integration | API endpoints must have integration tests |
| E2E | Critical user flows (future) |

### Test File Location

```
apps/agent-workspace/src/app/
├── core/services/
│   ├── queue.service.ts
│   └── queue.service.spec.ts  # Co-located
```

### Test Naming

```typescript
describe('QueueService', () => {
  describe('acceptTask', () => {
    it('should transition from RESERVED to ACTIVE', () => { });
    it('should throw error if not in RESERVED state', () => { });
    it('should notify server via WebSocket', () => { });
  });
});
```

---

## 8. Documentation Updates

### Files to Check for Updates

| Change Type | Update Required |
|-------------|-----------------|
| New feature | ARCHITECTURE.md (if architectural) |
| API change | ARCHITECTURE.md, API docs |
| New component | ARCHITECTURE.md project structure |
| State machine change | ARCHITECTURE.md state diagram |
| Tech stack change | ARCHITECTURE.md tech stack table |
| Git workflow change | BRANCH_STRATEGY.md |
| Agent guidelines | AGENT.md (this file) |

### Documentation Style

- Use tables for structured data
- Use code blocks with language hints
- Use mermaid diagrams for flows (when supported)
- Keep sections concise and scannable
- Update "Last Updated" date when modifying

---

## 9. Pre-Commit Checklist

Before every commit, verify:

### Code Quality
- [ ] No TypeScript errors: `npx nx build <project>`
- [ ] No lint errors: `npx nx lint <project>`
- [ ] Tests pass: `npx nx test <project>`
- [ ] No `any` types (unless justified)
- [ ] No `console.log` statements (use proper logging)
- [ ] No commented-out code
- [ ] No hardcoded values (use environment/config)

### Security
- [ ] No secrets or credentials in code
- [ ] No sensitive data in logs
- [ ] Input validation on API endpoints
- [ ] Proper error messages (no stack traces to client)

### Documentation
- [ ] JSDoc on public methods
- [ ] Updated ARCHITECTURE.md (if applicable)
- [ ] Meaningful commit message

---

## 10. PR Submission Checklist

### Before Creating PR

- [ ] All commits follow conventional commit format
- [ ] Branch is rebased on latest `develop`
- [ ] All checks pass (lint, test, build)
- [ ] Self-review completed
- [ ] No merge conflicts

### PR Description Must Include

```markdown
## Summary
- Brief description of changes (2-3 bullet points)

## Changes
- Detailed list of modifications
- Include file paths for significant changes

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Documentation
- [ ] ARCHITECTURE.md updated (if applicable)
- [ ] AGENT.md updated (if applicable)

## Screenshots (if UI changes)

## Related Issues
Closes NQ-xxx
```

### Request User Approval

**IMPORTANT:** Always request user approval before:
- Creating branches
- Pushing to remote
- Creating PRs
- Any destructive git operations

---

## Appendix A: Common Scopes Reference

| Scope | Path | Description |
|-------|------|-------------|
| `workspace` | `apps/agent-workspace` | Angular frontend app |
| `api` | `apps/api-server` | NestJS backend app |
| `gateway` | `apps/api-server/src/app/gateway` | WebSocket gateway |
| `models` | `libs/shared-models` | Shared TypeScript interfaces |
| `auth` | `*/core/guards`, `*/core/services/auth*` | Authentication |
| `queue` | `*/core/services/queue*` | Queue management |
| `stage` | `*/features/workspace/components/main-stage` | iFrame stage |
| `actions` | `*/features/workspace/components/action-bar` | Action bar |

---

## Appendix B: Environment Configuration

### Frontend Environment Files
```
apps/agent-workspace/src/environments/
├── environment.ts          # Development
└── environment.prod.ts     # Production
```

### Required Environment Variables
```typescript
export const environment = {
  production: boolean,
  apiUrl: string,        // e.g., 'http://localhost:3000/api'
};
```

---

## Appendix C: Error Codes Reference

| Code | Description | Resolution |
|------|-------------|------------|
| `STATE_INVALID` | Invalid state transition attempted | Check state machine rules |
| `TASK_NOT_FOUND` | Task ID not found | Verify task exists |
| `AGENT_NOT_CONNECTED` | WebSocket not connected | Check connection status |
| `TIMEOUT` | Operation timed out | Retry or check network |

---

*Last Updated: February 2026*
*Version: 1.0*
