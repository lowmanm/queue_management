# CLAUDE.md - Nexus Queue

This file provides context for AI assistants working on the Nexus Queue codebase.

## Project Overview

Nexus Queue is a real-time **Queue Orchestration Layer** that replaces legacy queue management systems. It aggregates tasks from various business lines and delivers the next best action to agents via a unified Angular workspace. Nexus owns **Priority & Delivery**, not the work itself — records stay in source systems.

The project uses a **"Screen-in-Screen" iFrame pattern** where source application URLs are loaded dynamically inside the workspace based on the task payload.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Angular | 21+ (standalone components) |
| Backend | NestJS | 11+ |
| Real-time | Socket.io | 4.8.3 |
| Monorepo | Nx | 22.4.5 |
| Language | TypeScript | 5.9 (strict mode) |
| Test Runner | Vitest | 4.0.8 |
| Styling | SCSS | - |
| Linting | ESLint | 9.8 (flat config) |
| Formatting | Prettier | 3.6 (singleQuote: true) |

## Repository Structure

```
nexus-queue/
├── apps/
│   ├── agent-workspace/          # Angular frontend (port 4200)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── core/
│   │       │   │   ├── guards/       # auth.guard.ts
│   │       │   │   └── services/     # auth, queue, socket, logger
│   │       │   └── features/
│   │       │       ├── login/        # Login component
│   │       │       └── workspace/    # Main workspace layout
│   │       │           └── components/
│   │       │               ├── header/
│   │       │               ├── sidebar/
│   │       │               ├── main-stage/   # iFrame container
│   │       │               └── action-bar/   # Dynamic task actions
│   │       └── environments/         # environment.ts, environment.prod.ts
│   └── api-server/               # NestJS backend (port 3000)
│       └── src/
│           └── app/
│               ├── gateway/          # WebSocket gateway (agent.gateway.ts)
│               ├── services/         # agent-manager, task-distributor
│               └── tasks/            # REST API (tasks.controller.ts)
├── libs/
│   └── shared-models/            # Shared TypeScript interfaces
│       └── src/lib/
│           ├── task.interface.ts
│           └── agent.interface.ts
├── ARCHITECTURE.md               # System design & vision
├── AGENT.md                      # AI agent development guidelines
├── BRANCH_STRATEGY.md            # Git workflow & conventions
└── CLAUDE.md                     # This file
```

## Essential Commands

```bash
# Development servers
npm run start:api              # NestJS backend on port 3000
npm run start:web              # Angular frontend on port 4200
npm run start:all              # Both in parallel

# Build
npx nx build agent-workspace
npx nx build api-server
npm run build:all              # All projects

# Test
npx nx test agent-workspace
npx nx test api-server
npm run test:all               # All projects

# Lint
npx nx lint agent-workspace
npx nx lint api-server

# Affected (only changed projects)
npx nx affected:build
npx nx affected:test
```

## Architecture

### Agent State Machine

```
OFFLINE → IDLE → RESERVED → ACTIVE → WRAP_UP → IDLE
```

| From | To | Trigger |
|------|----|---------|
| OFFLINE | IDLE | WebSocket connected |
| IDLE | RESERVED | Task assigned (Force Mode) |
| RESERVED | ACTIVE | Agent accepts |
| RESERVED | IDLE | Agent rejects / timeout |
| ACTIVE | WRAP_UP | Agent completes work |
| ACTIVE | IDLE | Agent transfers |
| WRAP_UP | IDLE | Disposition submitted |
| ANY | OFFLINE | Disconnect / logout |

### API Endpoints

**REST:**
- `GET /api/tasks/next?agentId=<optional>` — Pull Mode task retrieval

**WebSocket namespace:** `/queue`

Client → Server events:
- `agent:connect`, `agent:ready`, `agent:state-change`, `agent:task-action`, `agent:disposition-complete`

Server → Client events:
- `connection:ack`, `task:assigned`, `task:timeout`

### Key Services (Frontend)

- **AuthService** — Authentication & agent session management
- **QueueService** — Task queue state machine orchestration (~485 lines)
- **SocketService** — WebSocket connection, reconnection, event management (~339 lines)
- **LoggerService** — Structured logging with levels (DEBUG, INFO, WARN, ERROR)

### Key Services (Backend)

- **AgentManagerService** — Tracks connected agents and state (in-memory Map)
- **TaskDistributorService** — Generates and distributes mock tasks
- **TasksService** — REST endpoint handler for Pull Mode
- **AgentGateway** — WebSocket event handling for Force Mode

### Shared Models

Import path: `@nexus-queue/shared-models`

Key interfaces: `Task`, `Agent`, `TaskAction`, `TaskDisposition`, `TaskAssignment`, `AgentStateTransition`, `DeliveryConfig`

Key types: `TaskStatus` (`PENDING | RESERVED | ACTIVE | WRAP_UP | COMPLETED | TRANSFERRED | EXPIRED`), `AgentState` (`OFFLINE | IDLE | RESERVED | ACTIVE | WRAP_UP`)

## Code Conventions

### TypeScript

- Strict mode enabled — no `any` types unless absolutely necessary
- Use interfaces for all data structures
- Use union types for fixed values (e.g., `TaskStatus`, `AgentState`)

### Angular (Frontend)

- **Standalone components only** — no NgModules for components
- **Services:** `@Injectable({ providedIn: 'root' })` singleton pattern
- **State:** `BehaviorSubject` with observable streams
- **Observable naming:** private `fooSubject`, public `foo$`
- **Cleanup:** implement `OnDestroy` with `takeUntil(destroy$)` pattern
- **Component selectors:** kebab-case with `app` prefix
- **Directive selectors:** camelCase with `app` prefix
- **Change detection:** use `OnPush` where applicable

### NestJS (Backend)

- Feature-based module organization
- Thin controllers — business logic lives in services
- `class-validator` for DTO validation
- NestJS `Logger` class for logging (not `console.log`)

### File Naming

| Type | Pattern |
|------|---------|
| Component | `kebab-case.component.ts` |
| Service | `kebab-case.service.ts` |
| Interface | `kebab-case.interface.ts` |
| Module | `kebab-case.module.ts` |
| Guard | `kebab-case.guard.ts` |
| Test | co-located `*.spec.ts` |

### Import Order

1. Angular/NestJS core
2. Third-party libraries (rxjs, socket.io, etc.)
3. Shared libraries (`@nexus-queue/shared-models`)
4. Local/relative imports

### Formatting

- Single quotes (Prettier config)
- 2-space indentation
- UTF-8 encoding
- Trailing newline on all files
- Trim trailing whitespace (except markdown)

## Git Conventions

### Commit Messages

Format: `<type>(<scope>): <description>`

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

**Scopes:** `workspace`, `api`, `gateway`, `models`, `auth`, `queue`, `stage`, `actions`

### Pre-Commit Checklist

Before committing, verify:
1. `npx nx lint <project>` — no lint errors
2. `npx nx test <project>` — tests pass
3. `npx nx build <project>` — no build errors
4. No `any` types, no `console.log`, no commented-out code, no hardcoded secrets

## Current State

- **Phase 1 (Foundation):** Complete — mock auth, state machine, basic task distribution
- **Phase 2 (Real-time Push):** Complete — WebSocket gateway, Force Mode, task actions
- **Phase 3 (Logic Builder):** Planned — drag-and-drop queue criteria UI
- **Phase 4 (GCS Integration):** Planned — Google Cloud Storage event-driven ingestion
- **Database:** Not yet implemented — all data is mock/in-memory
- **CI/CD:** Not yet configured
- **Test coverage:** Minimal — test infrastructure is set up but coverage is sparse

## Environment Configuration

Frontend environment files at `apps/agent-workspace/src/environments/`:
- `environment.ts` — development (`apiUrl: 'http://localhost:3000/api'`)
- `environment.prod.ts` — production

Dev mode includes auto-login (Test_Agent_01) and debug log viewer.

## Related Documentation

- `ARCHITECTURE.md` — Full system design, state diagrams, roadmap
- `AGENT.md` — Detailed AI agent development guidelines, code patterns, checklists
- `BRANCH_STRATEGY.md` — Git workflow, branch naming, PR guidelines
