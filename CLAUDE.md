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
│   │       │   ├── core/         # Guards (auth, permission, agent) & Services
│   │       │   ├── shared/
│   │       │   │   └── components/
│   │       │   │       └── layout/   # AppShellComponent (SPA shell), PageLayoutComponent
│   │       │   └── features/
│   │       │       ├── login/        # Persona selector login
│   │       │       ├── dashboard/    # Default landing page
│   │       │       ├── workspace/    # Agent workspace (fullscreen)
│   │       │       │   └── components/  # header, sidebar, main-stage, action-bar, log-viewer
│   │       │       ├── admin/        # Designer + Admin routes (lazy)
│   │       │       └── manager/      # Manager routes (lazy)
│   │       ├── environments/     # environment.ts, environment.prod.ts
│   │       └── styles/           # Global SCSS
│   └── api-server/               # NestJS backend (port 3000, prefix /api)
│       └── src/app/
│           ├── gateway/          # WebSocket gateway (agent.gateway.ts)
│           ├── services/         # AgentManagerService, TaskDistributorService
│           └── tasks/            # TasksController, TasksService (REST endpoints)
├── libs/
│   └── shared-models/            # @nexus-queue/shared-models library
│       └── src/lib/              # task.interface.ts, agent.interface.ts
├── ARCHITECTURE.md               # System design, state machine, roadmap
├── ARCHITECTURE-V2.md            # Pipeline-centric orchestration redesign
├── BRANCH_STRATEGY.md            # Git workflow (Git Flow)
├── AGENT.md                      # Detailed AI agent development guidelines
└── CLAUDE.md                     # This file
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

**Frontend:**
- `QueueService` — State machine, task management, reservation timers
- `SocketService` — WebSocket connection with reconnection logic (max 5 attempts)
- `AuthService` — Authentication with dev auto-login (Test_Agent_01)
- `LoggerService` — Structured debug logging

**Backend:**
- `AgentManagerService` — Track agent connections and states
- `TaskDistributorService` — Priority-based task assignment
- `TasksService` — Mock task pool, task retrieval
- `AgentGateway` — WebSocket event handling

### Shared Models

Import path: `@nexus-queue/shared-models`

Key interfaces: `Task`, `Agent`, `TaskAction`, `TaskDisposition`, `AgentState`, `TaskStatus`

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
/login          → LoginComponent (outside shell, no auth required)
/               → AppShellComponent (persistent shell with router-outlet)
  ├── /         → DashboardComponent (default landing page)
  ├── /workspace → WorkspaceComponent (fullscreen mode, no sidebar/topbar)
  ├── /admin/*  → Admin/Designer routes (lazy-loaded)
  └── /manager/* → Manager routes (lazy-loaded)
```

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

- **ARCHITECTURE.md** — Full system design, state diagrams, component layout, and roadmap
- **ARCHITECTURE-V2.md** — Pipeline-centric orchestration redesign (Queue Manager, SLA Monitor, Distribution Engine)
- **BRANCH_STRATEGY.md** — Detailed branching workflows, PR templates, merge strategies
- **AGENT.md** — Comprehensive AI agent development guidelines, checklists, code patterns
- **README.md** — Getting started guide

## Project Status

- **Phase 1 (Foundation):** Complete — Mock auth, state machine, basic task distribution
- **Phase 2 (Real-time Push):** Complete — WebSocket gateway, Force Mode, task actions
- **Phase 2.5 (SPA Architecture):** Complete — Persistent layout shell, dashboard, fullscreen workspace, architectural navigation
- **Phase 2.5 (Orchestration Core):** Planned — See ARCHITECTURE-V2.md
- **Phase 3 (Logic Builder):** Planned — Drag-and-drop queue criteria configuration
- **Phase 4 (GCS Integration):** Planned — Google Cloud Storage event-driven ingestion
