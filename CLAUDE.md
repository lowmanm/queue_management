# CLAUDE.md - Nexus Queue Management System

## Project Overview

Nexus Queue is a real-time **Queue Orchestration Layer** that replaces legacy queue systems (Alvaria/Noble Maestro). It aggregates tasks from various business lines and pushes the next best action to backend employees via a unified Angular workspace. The system does **not** own the work (records stay in source systems) — it owns the **Priority** and the **Delivery**.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Angular | 21.x (standalone components) |
| Backend | NestJS | 11.x |
| Real-time | Socket.io | 4.8.x |
| Monorepo | Nx | 22.4.x |
| Language | TypeScript | 5.9.x (strict mode) |
| Testing | Vitest | 4.x (vitest-angular runner) |
| Linting | ESLint 9 (flat config) + Prettier |
| Styling | SCSS |
| Bundler | Webpack 5 (api-server), @angular/build (frontend) |

## Repository Structure

```
nexus-queue/
├── apps/
│   ├── agent-workspace/          # Angular frontend (port 4200)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── core/
│   │       │   │   ├── guards/       # auth, permission (+ agent, manager, designer, admin)
│   │       │   │   └── services/     # auth, queue, socket, logger, agent-stats,
│   │       │   │                     # disposition, manager-api, session-api
│   │       │   ├── shared/
│   │       │   │   └── components/
│   │       │   │       └── layout/   # AppShellComponent (SPA shell), PageLayoutComponent
│   │       │   └── features/
│   │       │       ├── login/        # Persona selector login
│   │       │       ├── dashboard/    # Default landing page
│   │       │       ├── workspace/    # Agent workspace (fullscreen)
│   │       │       │   └── components/  # header, sidebar, main-stage, action-bar,
│   │       │       │                    # agent-controls, agent-stats, log-viewer
│   │       │       ├── admin/        # Designer + Admin routes (lazy)
│   │       │       │   ├── components/  # volume-loader, pipelines, skills, dispositions,
│   │       │       │   │                # work-states, users
│   │       │       │   └── services/    # disposition, pipeline, rules, skill, volume-loader
│   │       │       └── manager/      # Manager routes (lazy)
│   │       │           └── components/  # team-dashboard, queue-monitor, skill-assignments
│   │       ├── environments/     # environment.ts, environment.prod.ts
│   │       └── styles/           # Global SCSS
│   └── api-server/               # NestJS backend (port 3000, prefix /api)
│       └── src/app/
│           ├── agents/           # AgentsController
│           ├── dispositions/     # DispositionsController
│           ├── gateway/          # AgentGateway (WebSocket)
│           ├── metrics/          # MetricsController
│           ├── pipelines/        # PipelineController, PipelineService
│           ├── queues/           # QueuesController, QueuesService
│           ├── rbac/             # RBACController
│           ├── routing/          # RoutingController, RoutingService
│           ├── rules/            # RulesController
│           ├── services/         # 11 core services (see Key Services below)
│           ├── sessions/         # SessionsController
│           ├── task-sources/     # TaskSourcesController
│           ├── tasks/            # TasksController, TasksService
│           ├── volume-loader/    # VolumeLoaderController, VolumeLoaderService
│           └── proxy/            # ProxyController (URL embeddability checks for iframes)
├── libs/
│   └── shared-models/            # @nexus-queue/shared-models library
│       └── src/lib/              # 11 interface files (see Shared Models below)
│           └── index.ts          # Barrel export
├── ARCHITECTURE.md               # System design, orchestration, state machine, roadmap
├── BRANCH_STRATEGY.md            # Git workflow (Git Flow)
├── CLAUDE.md                     # This file
└── README.md                     # Getting started guide
```

## Quick Start Commands

```bash
# Install dependencies
npm install

# Start both apps in parallel
npm run start:all

# Start individually
npm run start:api         # API server at http://localhost:3000/api
npm run start:web         # Angular app at http://localhost:4200

# Build
npm run build:all
npx nx build agent-workspace
npx nx build api-server

# Test
npm run test:all
npx nx test agent-workspace
npx nx test api-server

# Lint
npx nx lint agent-workspace
npx nx lint api-server

# Affected (only changed projects)
npx nx affected:build
npx nx affected:test
```

## Architecture Essentials

### Agent State Machine

```
OFFLINE → IDLE → RESERVED → ACTIVE → WRAP_UP → IDLE
```

- **OFFLINE → IDLE**: WebSocket connected & acknowledged
- **IDLE → RESERVED**: Task assigned (server push via Force Mode)
- **RESERVED → ACTIVE**: Agent accepts task
- **RESERVED → IDLE**: Agent rejects or timeout expires
- **ACTIVE → WRAP_UP**: Agent completes work
- **ACTIVE → IDLE**: Agent transfers task
- **WRAP_UP → IDLE**: Disposition submitted
- **ANY → OFFLINE**: WebSocket disconnect or logout

### WebSocket Event Naming

| Direction | Pattern | Examples |
|-----------|---------|---------|
| Client → Server | `verb:noun` | `agent:ready`, `task:accept` |
| Server → Client | `noun:event` | `task:assigned`, `connection:ack` |

### Key Services

**Frontend (core/services/):**
- `AuthService` — Authentication, RBAC, persona switching, role-based routing
- `QueueService` — State machine, task management, reservation timers
- `SocketService` — WebSocket connection with reconnection logic (max 5 attempts)
- `LoggerService` — Structured debug logging
- `AgentStatsService` — Real-time agent performance metrics (tasks completed, avg handle time)
- `DispositionService` — Task disposition management
- `ManagerApiService` — Manager dashboard API calls (team status, queue stats)
- `SessionApiService` — Agent session lifecycle API calls

**Admin feature services (features/admin/services/):**
- `SkillApiService` — Skill CRUD and agent-skill assignment management
- `DispositionService` — Admin disposition management
- `PipelineService` — Pipeline configuration
- `RulesService` — Rule management
- `VolumeLoaderService` — Volume loader configuration

**Backend (services/):**
- `PipelineOrchestratorService` — Central ingestion: validate → transform → route → enqueue
- `QueueManagerService` — Priority queue with DLQ and backpressure
- `TaskStoreService` — Single task lifecycle store
- `TaskDistributorService` — Agent-task matching via scoring
- `SLAMonitorService` — Periodic SLA compliance checking and escalation
- `RuleEngineService` — Task transformation via configurable rule sets
- `AgentManagerService` — Agent connection and state tracking
- `AgentSessionService` — Agent session lifecycle management
- `DispositionService` — Disposition management and validation
- `TaskSourceService` — CSV parsing and data source adapters
- `RBACService` — Role-based access control

**Backend (feature modules with own services):**
- `RoutingService` (`routing/`) — Agent scoring (skill match, workload, idle time)
- `PipelineService` (`pipelines/`) — Pipeline lifecycle management
- `QueuesService` (`queues/`) — Queue CRUD operations
- `TasksService` (`tasks/`) — Task lifecycle operations
- `VolumeLoaderService` (`volume-loader/`) — Volume loader management
- `ProxyController` (`proxy/`) — URL embeddability checks for iframe rendering

### Shared Models

Import path: `@nexus-queue/shared-models`

| Interface File | Key Exports |
|----------------|-------------|
| `task.interface.ts` | `Task`, `TaskAction`, `TaskDisposition`, `TaskStatus` |
| `agent.interface.ts` | `Agent`, `AgentState` |
| `agent-stats.interface.ts` | `AgentStats`, `AgentPerformanceMetrics` |
| `disposition.interface.ts` | `Disposition`, `DispositionCategory` |
| `pipeline.interface.ts` | `Pipeline`, `PipelineConfig`, `RoutingRule` |
| `rbac.interface.ts` | `UserRole`, `Permission`, `UserProfile` |
| `routing.interface.ts` | `Skill`, `SkillCategory`, `AgentSkill`, `SkillProficiency`, `RoutingStrategy`, `RoutingAlgorithm`, `AgentRoutingScore`, `RoutingDecision`, `AgentCapacity` |
| `rule.interface.ts` | `Rule`, `RuleSet`, `RuleCondition`, `RuleAction` |
| `task-source.interface.ts` | `TaskSource`, `TaskSourceConfig` |
| `volume-loader.interface.ts` | `VolumeLoader`, `VolumeLoaderConfig` |
| `work-state.interface.ts` | `WorkState`, `WorkStateType` |

## Development Conventions

### TypeScript

- **Strict mode** required — no `any` unless justified
- Use interfaces for data structures, enums/union types for fixed values
- JSDoc comments on public methods and all shared model interfaces

### Angular (Frontend)

- Standalone components only (no NgModules for components)
- State management via `BehaviorSubject` in services
- Services use `providedIn: 'root'` for singletons
- `OnPush` change detection where applicable
- `takeUntil` pattern for subscription cleanup in `OnDestroy`
- Import order: Angular core → Third-party → `@nexus-queue/*` → Local/relative

### NestJS (Backend)

- Feature-based module organization
- Thin controllers — business logic lives in services
- Injectable services with single responsibility
- Use NestJS exception filters for error handling

### Observable Naming

```typescript
private dataSubject = new BehaviorSubject<Data | null>(null);  // Private: ends with 'Subject'
public data$ = this.dataSubject.asObservable();                 // Public: ends with '$'
```

### File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Component | `kebab-case.component.ts` | `header.component.ts` |
| Service | `kebab-case.service.ts` | `queue.service.ts` |
| Interface | `kebab-case.interface.ts` | `task.interface.ts` |
| Module | `kebab-case.module.ts` | `gateway.module.ts` |
| Guard | `kebab-case.guard.ts` | `auth.guard.ts` |
| Tests | `*.spec.ts` (co-located with source) | `queue.service.spec.ts` |

## Git Workflow

### Branch Strategy (Git Flow)

| Branch | Pattern | Purpose |
|--------|---------|---------|
| `main` | `main` | Production-ready, tagged releases |
| `develop` | `develop` | Integration branch |
| `feature` | `feature/NQ-xxx-description` | New features |
| `bugfix` | `bugfix/NQ-xxx-description` | Bug fixes |
| `release` | `release/x.x.x` | Release prep |
| `hotfix` | `hotfix/NQ-xxx-description` | Critical production fixes |

### Commit Messages (Conventional Commits)

```
<type>(<scope>): <description>
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

**Scopes:** `workspace`, `api`, `gateway`, `models`, `auth`, `queue`, `stage`, `actions`

**Examples:**
```
feat(gateway): add automatic reconnection logic
fix(workspace): resolve header overflow on mobile
docs(models): add JSDoc comments to Task interface
```

## Pre-Commit Checklist

- [ ] `npx nx build <project>` — no TypeScript errors
- [ ] `npx nx lint <project>` — no lint errors
- [ ] `npx nx test <project>` — all tests pass
- [ ] No `any` types (unless justified)
- [ ] No `console.log` in production code (use LoggerService)
- [ ] No commented-out code
- [ ] No hardcoded values (use environment/config)
- [ ] No secrets or credentials in code

## Environment Configuration

Frontend environments: `apps/agent-workspace/src/environments/`

```typescript
export const environment = {
  production: boolean,
  apiUrl: string,        // e.g., 'http://localhost:3000/api'
};
```

Backend: Port configurable via `PORT` env var (default 3000). CORS enabled for `localhost:4200`.

## SPA Architecture

The frontend uses a **persistent layout shell** pattern for true SPA behaviour.

### Route Structure

```
/login              → LoginComponent (outside shell, no auth required)
/                   → AppShellComponent (persistent shell with router-outlet)
  ├── /             → DashboardComponent (default landing page)
  ├── /workspace    → WorkspaceComponent (fullscreen, agentGuard)
  ├── /admin/*      → Admin/Designer routes (lazy-loaded)
  │   ├── /admin/volume-loaders  → VolumeLoaderComponent (designerGuard)
  │   ├── /admin/pipelines       → PipelinesComponent (designerGuard)
  │   ├── /admin/skills          → SkillsComponent (designerGuard)
  │   ├── /admin/dispositions    → DispositionsComponent (designerGuard)
  │   ├── /admin/work-states     → WorkStatesComponent (designerGuard)
  │   └── /admin/users           → UsersComponent (adminGuard)
  └── /manager/*    → Manager routes (lazy-loaded)
      ├── /manager/team          → TeamDashboardComponent (managerGuard)
      ├── /manager/queues        → QueueMonitorComponent (managerGuard)
      └── /manager/skills        → SkillAssignmentsComponent (managerGuard)
```

### Route Guards

| Guard | File | Purpose |
|-------|------|---------|
| `authGuard` | `auth.guard.ts` | Requires authenticated user |
| `permissionGuard` | `permission.guard.ts` | Checks route `data.permissions` / `data.roles` |
| `agentGuard` | `permission.guard.ts` | Requires `tasks:work` permission |
| `designerGuard` | `permission.guard.ts` | Requires DESIGNER or ADMIN role |
| `managerGuard` | `permission.guard.ts` | Requires MANAGER or ADMIN role |
| `adminGuard` | `permission.guard.ts` | Requires ADMIN role |

### AppShellComponent

- Uses `<router-outlet>` (not `<ng-content>`) so the shell persists across route transitions
- Sidebar, top-bar with breadcrumbs, and footer do NOT re-render during navigation
- Route data `{ fullscreen: true }` hides all shell chrome (used by Workspace)
- Sidebar navigation is organized by **functional area** (Home, Workspace, Operations, Configuration, System) — not by role

### Fullscreen Mode

The Workspace route uses `data: { fullscreen: true }` to bypass the shell's sidebar/topbar/footer. The workspace manages its own header with agent controls, stats, and user switching. The shell component still wraps it (for SPA persistence) but renders no visual chrome.

### Default Routes

- **AGENT** → `/workspace` (direct to task queue)
- **All other roles** → `/` (dashboard with role-appropriate quick-nav cards)

## Related Documentation

- **ARCHITECTURE.md** — Full system design, orchestration flow, state machine, project structure, and roadmap
- **BRANCH_STRATEGY.md** — Detailed branching workflows, PR templates, merge strategies
- **README.md** — Getting started guide

## Project Status

- **Phase 1 (Foundation):** Complete — Mock auth, state machine, basic task distribution
- **Phase 2 (Real-time Push):** Complete — WebSocket gateway, Force Mode, task actions
- **Phase 2.5 (SPA Architecture):** Complete — Persistent layout shell, dashboard, fullscreen workspace, architectural navigation
- **Phase 2.5 (Orchestration Core):** In Progress — Pipeline Orchestrator, Queue Manager, SLA Monitor, Distribution Engine
- **Phase 3 (Logic Builder):** Planned — Drag-and-drop queue criteria configuration
- **Phase 4 (Persistence + Production):** Planned — PostgreSQL-backed queues, Redis, event sourcing
