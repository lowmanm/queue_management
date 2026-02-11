# Nexus Queue - Queue Management System

A real-time Queue Orchestration Layer built with Angular 21 and NestJS 11 in an Nx monorepo. Replaces legacy queue systems by aggregating tasks from multiple business lines and intelligently pushing the next best action to agents.

## Project Structure

```
nexus-queue/
├── apps/
│   ├── agent-workspace/    # Angular 21.x frontend (SPA with persistent layout shell)
│   └── api-server/         # NestJS 11.x backend (REST + WebSocket)
├── libs/
│   └── shared-models/      # Shared TypeScript interfaces (@nexus-queue/shared-models)
├── ARCHITECTURE.md         # System design & orchestration flow
├── BRANCH_STRATEGY.md      # Git workflow (Git Flow)
└── CLAUDE.md               # AI agent context & conventions
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+

### Installation

```bash
npm install
```

### Development

Start both applications:

```bash
npm run start:all
```

Or start individually:

```bash
# API server (http://localhost:3000/api)
npm run start:api

# Angular app (http://localhost:4200)
npm run start:web
```

### Build & Test

```bash
npm run build:all
npm run test:all

# Individual projects
npx nx build agent-workspace
npx nx build api-server
npx nx test agent-workspace
npx nx test api-server
npx nx lint agent-workspace
npx nx lint api-server
```

## Applications

### Agent Workspace (Angular)

A single-page application with a persistent layout shell (sidebar, top-bar, breadcrumbs, footer) that persists across route transitions.

**Key features:**
- **Dashboard** — Role-adaptive landing page with quick-nav cards
- **Agent Workspace** — Fullscreen task processing with iFrame-based "screen-in-screen" display
- **Admin/Designer views** — Pipeline configuration, data sources, dispositions, work states, user management
- **Manager views** — Team dashboard, queue monitoring
- **RBAC** — Four personas (Agent, Manager, Designer, Admin) with cascading permissions
- **Real-time** — WebSocket-driven agent state machine and task push (Force Mode)

### API Server (NestJS)

Backend orchestration server with pipeline-centric task flow.

**Key capabilities:**
- Pipeline Orchestrator — validate, transform, route, and enqueue tasks
- Priority Queue Manager with Dead Letter Queue (DLQ)
- SLA Monitor with automatic priority escalation
- Distribution Engine for agent-task matching
- WebSocket Gateway for real-time agent communication
- RBAC service for role-based access control
- Volume Loader for CSV/external data source ingestion

### Shared Models

The `@nexus-queue/shared-models` library provides 11 TypeScript interface files covering tasks, agents, pipelines, dispositions, routing, rules, RBAC, volume loaders, and work states.

## Documentation

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, orchestration flow, state machine, project structure |
| [BRANCH_STRATEGY.md](BRANCH_STRATEGY.md) | Git Flow branching, commit conventions, PR templates |
| [CLAUDE.md](CLAUDE.md) | AI agent context, development conventions, quick reference |
