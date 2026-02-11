# Project Nexus: Architecture & Vision

## 1. Executive Summary

Project Nexus is a custom-built, real-time **Queue Orchestration Layer** designed to replace legacy systems (Alvaria/Noble Maestro). Its primary purpose is to aggregate tasks from various business lines and intelligently "push" the next best action to backend employees via a unified, high-performance Angular workspace.

### Key Drivers

| Driver | Description |
|--------|-------------|
| **Cost Reduction** | Eliminating high vendor licensing fees |
| **Latency** | Moving from batch-file transfers to real-time API/Event-driven ingestion |
| **Flexibility** | Full control over UI, custom buttons, and routing logic without vendor constraints |

---

## 2. System Architecture

Nexus operates as a **Decoupled Orchestrator**. It does not own the "work" (the records stay in source systems); it owns the **Priority** and the **Delivery**.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES (Producers)                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  CSV/    │  │   GCS    │  │   S3     │  │   HTTP   │  │  Manual  │    │
│  │  Upload  │  │  Bucket  │  │  Bucket  │  │   API    │  │  Entry   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       └──────────────┴──────────────┴──────────────┴──────────────┘         │
│                                     │                                       │
│                          Volume Loader Service                              │
│                        (Ingestion + Scheduling)                             │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORCHESTRATOR (The Brain)                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Pipeline Orchestrator                            │   │
│  │                                                                      │   │
│  │  1. VALIDATE ──→ 2. TRANSFORM ──→ 3. ROUTE ──→ 4. ENQUEUE          │   │
│  │   (Schema)       (Rule Engine)    (Pipeline     (Priority            │   │
│  │                                    Routing       Queue)              │   │
│  │                                    Rules)                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐    │
│  │  Rule Engine   │  │  SLA Monitor   │  │   Distribution Engine     │    │
│  │  (Transform)   │  │  (Escalation)  │  │   (Agent Assignment)      │    │
│  └────────────────┘  └────────────────┘  └────────────────────────────┘    │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    QUEUE LAYER (The Transport)                               │
│                                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                   │
│  │  Priority Q   │  │  Standard Q   │  │  Overflow Q   │  ...per Pipeline │
│  │  (P1-P3)      │  │  (P4-P7)      │  │  (P8-P10)     │                   │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘                   │
│          └──────────────────┼──────────────────┘                            │
│                             │                                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    Dead Letter Queue (DLQ)                            │  │
│  │        Tasks that fail repeatedly or exceed max retry count           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT INTERFACE (The Workers)                             │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐                      │
│  │   Agent Workspace     │  │   Manager Dashboard   │                      │
│  │  (Angular SPA Shell)  │  │   (Queue Monitoring)  │                      │
│  └───────────────────────┘  └───────────────────────┘                      │
│                                                                             │
│                    WebSocket Gateway (Force Mode Push)                       │
│                    Agent State Machine (Work States)                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend** | Angular | 21.1.x (standalone components) |
| **Backend** | NestJS | 11.x |
| **Real-time** | Socket.io | 4.8.x |
| **Monorepo** | Nx | 22.4.x |
| **Language** | TypeScript | 5.9.x (strict mode) |
| **Testing** | Vitest | 4.x (vitest-angular runner) |
| **Linting** | ESLint 9 (flat config) + Prettier |
| **Styling** | SCSS |
| **Bundler** | Webpack 5 (api-server), @angular/build (frontend) |

---

## 3. Agent State Machine

```
┌──────────┐    Connected    ┌──────────┐   Task Pushed   ┌──────────┐
│ OFFLINE  │────────────────▶│   IDLE   │────────────────▶│ RESERVED │
└──────────┘                 └──────────┘                 └──────────┘
     ▲                            ▲                            │
     │                            │                            │ Accept
     │ Disconnect                 │ Timeout/Reject             ▼
     │                            │                       ┌──────────┐
     │                            └───────────────────────│  ACTIVE  │
     │                                                    └──────────┘
     │                            ┌──────────┐                 │
     │                            │   IDLE   │◀────Transfer────┤
     │                            └──────────┘                 │
     │                                 ▲                       │ Complete
     │                                 │                       ▼
     │                                 │ Disposition      ┌──────────┐
     │                                 └──────────────────│ WRAP_UP  │
     │                                                    └──────────┘
     │
     └─────────────────── (From any state on disconnect)
```

| From | To | Trigger |
|------|----|---------|
| OFFLINE | IDLE | WebSocket connected & acknowledged |
| IDLE | RESERVED | Task assigned (Force Mode push) |
| RESERVED | ACTIVE | Agent accepts task |
| RESERVED | IDLE | Agent rejects or timeout expires |
| ACTIVE | WRAP_UP | Agent completes work |
| ACTIVE | IDLE | Agent transfers task |
| WRAP_UP | IDLE | Disposition submitted |
| ANY | OFFLINE | WebSocket disconnect or logout |

---

## 4. The "Screen-in-Screen" Strategy

To provide a seamless experience where it feels like the agent is working directly in the source application:

| Feature | Description |
|---------|-------------|
| **iFrame Wrapping** | Source application URLs are loaded dynamically based on the task payload |
| **PostMessage API** | Nexus listens for events from the framed application (where possible) to automatically move tasks to "Completed" status |
| **Sandbox Security** | iFrames are sandboxed to prevent source apps from redirecting the main Nexus window |

---

## 5. Pipeline-Centric Orchestration

### Design Principle

Everything flows through a **Pipeline**. A Pipeline is the single organizing concept that connects ingestion, routing, queuing, distribution, and completion.

### Orchestration Flow

```
Data arrives (CSV upload, VolumeLoader poll, API call, manual entry)
         │
         ▼
Step 1: VALIDATE — check required fields against pipeline schema
         │
         ▼
Step 2: TRANSFORM — apply Rule Engine modifications (priority, skills, metadata)
         │
         ▼
Step 3: ROUTE — determine target queue via Pipeline routing rules
         │
         ▼
Step 4: ENQUEUE — place into the correct priority queue with SLA deadline
         │
         ▼
Step 5: DISTRIBUTE — attempt immediate assignment if agents available
         │
         ▼
Step 6: WORK — agent accepts/rejects; works task in iFrame
         │
         ▼
Step 7: COMPLETE — agent submits disposition, task marked COMPLETED
```

### Task Lifecycle

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ INGESTED │────→│  QUEUED  │────→│ RESERVED │────→│  ACTIVE  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                │                 │
                      │           timeout/reject         │
                      │                │                 │
                      │    ┌───────────┘                 │
                      │    ▼                             ▼
                      │  ┌──────────┐             ┌──────────┐
                      │  │ RE-QUEUED│             │ WRAP_UP  │
                      │  └──────────┘             └──────────┘
                      │                                 │
                      │  (maxRetries exceeded)          ▼
                      ▼                           ┌──────────┐
                 ┌──────────┐                     │COMPLETED │
                 │   DLQ    │                     └──────────┘
                 └──────────┘
```

### Core Backend Services

| Service | Status | Responsibility |
|---------|--------|----------------|
| **PipelineOrchestratorService** | Implemented | Central ingestion: validate → transform → route → enqueue |
| **QueueManagerService** | Implemented | Priority queue with DLQ and backpressure |
| **TaskStoreService** | Implemented | Single task lifecycle store |
| **DistributionEngineService** (TaskDistributorService) | Implemented | Agent-task matching via scoring |
| **SLAMonitorService** | Implemented | Periodic SLA compliance checking and escalation |
| **RuleEngineService** | Implemented | Task transformation via configurable rule sets |
| **RoutingService** | Implemented | Agent scoring (skill match, workload, idle time) |
| **AgentManagerService** | Implemented | Agent connection and state tracking |
| **AgentSessionService** | Implemented | Agent session lifecycle management |
| **DispositionService** | Implemented | Disposition management and validation |
| **TaskSourceService** | Implemented | CSV parsing and data source adapters |
| **RBACService** | Implemented | Role-based access control |

### Queue Designer Configuration

```
DESIGNER CONFIGURES:                    ORCHESTRATOR USES:
═══════════════════                     ══════════════════

Pipeline                         ──→   Orchestrator knows which pipeline to route through
  ├── Data Schema                ──→   Step 1: VALIDATE (field types, required fields)
  ├── Routing Rules              ──→   Step 3: ROUTE (conditions → target queue)
  ├── SLA Config                 ──→   SLA Monitor thresholds and escalation
  └── Allowed Work Types         ──→   Ingestion filter

Pipeline Queues                  ──→   Queue Manager creates named queues
  ├── Priority                   ──→   Queue processing order
  ├── Required Skills            ──→   Distribution Engine agent filtering
  └── Max Capacity               ──→   Queue Manager enforces backpressure

Rule Sets (Logic Builder)        ──→   Step 2: TRANSFORM (modify task before routing)

Routing Strategies               ──→   Distribution Engine algorithm selection

Dispositions                     ──→   WRAP_UP → COMPLETED transition rules

Work States                      ──→   Agent availability for distribution

Volume Loaders                   ──→   Data source ingestion configuration
```

### Priority Queue Behavior

- Dequeue always returns the **lowest priority number** (highest urgency)
- Within same priority, **FIFO** (oldest first)
- SLA-breaching tasks get automatic priority boost
- Tasks exceeding `maxRetries` go to DLQ
- Current implementation: in-memory Maps (production target: PostgreSQL)

### Dead Letter Queue (DLQ)

Tasks enter DLQ for: `max_retries_exceeded`, `no_route`, `schema_validation_failed`, `sla_expired`. Manager/Admin actions: RETRY, REASSIGN, REROUTE, DISCARD.

---

## 6. Frontend Architecture

### SPA Shell Pattern

The frontend uses a **persistent layout shell** with `<router-outlet>` so that sidebar, top-bar, breadcrumbs, and footer survive route transitions.

```
/login           → LoginComponent (outside shell)
/                → AppShellComponent (persistent SPA shell)
  ├── /          → DashboardComponent (default landing)
  ├── /workspace → WorkspaceComponent (fullscreen, no shell chrome)
  ├── /admin/*   → Admin/Designer routes (lazy-loaded)
  └── /manager/* → Manager routes (lazy-loaded)
```

- Route data `{ fullscreen: true }` hides shell chrome (used by Workspace)
- Sidebar navigation organized by **functional area** (Home, Workspace, Operations, Configuration, System)
- RBAC controls visibility; AGENT → `/workspace` by default, all others → `/` (dashboard)

### Workspace Component Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Header: App title, navigation, agent controls, user info      │
├──────────────┬───────────────────────────────────────────────┤
│   Sidebar    │              Main Stage                        │
│  Task info   │        (iFrame - Source Application)          │
│  Metadata    │                                                │
├──────────────┴───────────────────────────────────────────────┤
│ Action Bar: Accept, Reject, Complete, Transfer, etc.          │
└──────────────────────────────────────────────────────────────┘
```

### RBAC & Personas

Four roles with cascading permissions:

| Role | Default Route | Access |
|------|---------------|--------|
| **AGENT** | `/workspace` | Workspace only |
| **MANAGER** | `/` (dashboard) | Workspace + Operations (Team Dashboard, Queue Monitor) |
| **DESIGNER** | `/` (dashboard) | Workspace + Configuration (Pipelines, Data Sources, Dispositions, Work States) |
| **ADMIN** | `/` (dashboard) | Full access including System (User Management) |

---

## 7. Project Structure

```
nexus-queue/
├── apps/
│   ├── agent-workspace/              # Angular 21.x frontend (port 4200)
│   │   └── src/
│   │       ├── app/
│   │       │   ├── core/
│   │       │   │   ├── guards/       # auth.guard, permission.guard
│   │       │   │   └── services/     # 8 core services (auth, queue, socket, etc.)
│   │       │   ├── shared/
│   │       │   │   └── components/
│   │       │   │       └── layout/   # AppShellComponent, PageLayoutComponent
│   │       │   └── features/
│   │       │       ├── login/        # Persona selector login
│   │       │       ├── dashboard/    # Default landing page
│   │       │       ├── workspace/    # Agent workspace (fullscreen)
│   │       │       │   └── components/  # header, sidebar, main-stage, action-bar,
│   │       │       │                    # agent-controls, agent-stats, log-viewer
│   │       │       ├── admin/        # Designer + Admin routes (lazy)
│   │       │       │   ├── components/  # volume-loader, pipelines, dispositions,
│   │       │       │   │                # work-states, users
│   │       │       │   └── services/    # disposition, pipeline, rules, volume-loader
│   │       │       └── manager/      # Manager routes (lazy)
│   │       │           └── components/  # team-dashboard, queue-monitor
│   │       ├── environments/
│   │       └── styles/
│   └── api-server/                   # NestJS 11.x backend (port 3000, prefix /api)
│       └── src/app/
│           ├── agents/               # AgentsController
│           ├── dispositions/         # DispositionsController
│           ├── gateway/              # AgentGateway (WebSocket)
│           ├── metrics/              # MetricsController
│           ├── pipelines/            # PipelineController, PipelineService
│           ├── queues/               # QueuesController, QueuesService
│           ├── rbac/                 # RBACController
│           ├── routing/              # RoutingController, RoutingService
│           ├── rules/                # RulesController
│           ├── services/             # 11 core services (see §5 table)
│           ├── sessions/             # SessionsController
│           ├── task-sources/         # TaskSourcesController
│           ├── tasks/                # TasksController, TasksService
│           └── volume-loader/        # VolumeLoaderController, VolumeLoaderService
├── libs/
│   └── shared-models/                # @nexus-queue/shared-models
│       └── src/lib/                  # 11 interface files
│           ├── task.interface.ts
│           ├── agent.interface.ts
│           ├── agent-stats.interface.ts
│           ├── disposition.interface.ts
│           ├── pipeline.interface.ts
│           ├── rbac.interface.ts
│           ├── routing.interface.ts
│           ├── rule.interface.ts
│           ├── task-source.interface.ts
│           ├── volume-loader.interface.ts
│           └── work-state.interface.ts
├── ARCHITECTURE.md                   # This document
├── BRANCH_STRATEGY.md                # Git workflow (Git Flow)
├── CLAUDE.md                         # AI agent context & development conventions
└── README.md                         # Getting started guide
```

---

## 8. WebSocket Event Protocol

| Direction | Pattern | Examples |
|-----------|---------|---------|
| Client → Server | `verb:noun` | `agent:ready`, `task:accept`, `task:reject` |
| Server → Client | `noun:event` | `task:assigned`, `connection:ack`, `sla:warning` |

---

## 9. Development Phases

| Phase | Name | Status | Description |
|-------|------|--------|-------------|
| **1** | Foundation | Complete | Mock auth, agent state machine, basic task distribution |
| **2** | Real-time Push | Complete | WebSocket gateway, Force Mode, task actions |
| **2.5a** | SPA Architecture | Complete | Persistent layout shell, dashboard, fullscreen workspace, RBAC navigation |
| **2.5b** | Orchestration Core | In Progress | Pipeline Orchestrator, Queue Manager, SLA Monitor, Distribution Engine |
| **3** | Logic Builder | Planned | Drag-and-drop queue criteria configuration, pipeline creation wizard, DLQ monitor |
| **4** | Persistence + Production | Planned | PostgreSQL-backed queues, Redis for real-time ops, event sourcing, horizontal scaling |

---

## 10. Future: Durable Queue (Database-Backed)

Current implementation uses in-memory Maps. Target:

```sql
CREATE TABLE queue_tasks (
  id            UUID PRIMARY KEY,
  pipeline_id   UUID NOT NULL,
  queue_id      UUID NOT NULL,
  task_payload  JSONB NOT NULL,
  priority      SMALLINT NOT NULL DEFAULT 5,
  status        VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  enqueued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sla_deadline  TIMESTAMPTZ,
  retry_count   SMALLINT NOT NULL DEFAULT 0,
  max_retries   SMALLINT NOT NULL DEFAULT 3,
  assigned_to   UUID,
  reserved_at   TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  disposition   JSONB
);

CREATE INDEX idx_queue_dequeue
  ON queue_tasks (queue_id, priority ASC, enqueued_at ASC)
  WHERE status = 'QUEUED';
```

---

*Last Updated: February 2026*
*Version: 2.0*
