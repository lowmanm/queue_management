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

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Workspace                          │
│                         (Angular 17+)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Header    │  │   Sidebar   │  │      Main Stage         │ │
│  │ Agent/Status│  │  Task Info  │  │  (iFrame - Source App)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestration Server                         │
│                         (NestJS)                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Agent State │  │    Task     │  │   Priority/Routing      │ │
│  │  Manager    │  │   Queue     │  │       Engine            │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Shared Models                              │
│                      (Nx Library)                               │
│         TypeScript interfaces for Task, User, etc.              │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Agent Workspace** | Angular 17+ | "Single Pane of Glass" UI utilizing internal Design System with "Screen-in-Screen" iFrame wrapper |
| **Orchestration Server** | NestJS | The brain - manages agent states (Available, Busy, Wrap-up) and calculates task distribution |
| **Shared Models** | Nx Library | Strict TypeScript definitions ensuring Task/User objects are consistent across frontend and backend |

---

## 3. The "Screen-in-Screen" Strategy

To provide a seamless experience where it feels like the agent is working directly in the source application:

### Implementation Details

| Feature | Description |
|---------|-------------|
| **iFrame Wrapping** | Source application URLs are loaded dynamically based on the task payload |
| **PostMessage API** | Nexus listens for events from the framed application (where possible) to automatically move tasks to "Completed" status |
| **Sandbox Security** | iFrames are sandboxed to prevent source apps from redirecting the main Nexus window |

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│    Nexus     │────▶│   iFrame     │────▶│  Source App  │
│  Workspace   │     │  Container   │     │  (External)  │
└──────────────┘     └──────────────┘     └──────────────┘
       ▲                    │
       │    postMessage     │
       └────────────────────┘
```

---

## 4. Technical Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Frontend** | Angular 17+ | Standalone components, signals-ready |
| **Backend** | NestJS | Modular architecture with TypeScript |
| **Real-time** | Socket.io (WebSockets) | Bi-directional agent-server communication |
| **Data Ingestion** | Dynamic (JSON/GCS) | Flexible source integration |
| **Monorepo** | Nx | Shared libraries, build optimization |
| **Styling** | SCSS | Internal Design System (future) |

---

## 5. Development Phases

### Phase 1: The Foundation ✅ Complete

The initial build focused on the **"Heartbeat"**—the connection between the Agent and the Server.

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1 | Mock Authentication | Local development bypasses SSO for speed | ✅ Complete |
| 2 | The State Machine | Agent state flow: `OFFLINE → IDLE → RESERVED → ACTIVE → WRAP_UP` | ✅ Complete |
| 3 | Basic Distribution | Task API with priority-based assignment | ✅ Complete |

### Phase 2: Real-time Push ✅ Complete

WebSocket-based Force Mode for server-initiated task delivery.

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1 | WebSocket Gateway | Socket.io integration on NestJS backend | ✅ Complete |
| 2 | Agent Connection | Real-time agent registration and state tracking | ✅ Complete |
| 3 | Force Mode | Server pushes tasks to agents automatically | ✅ Complete |
| 4 | Task Actions | Accept, Reject, Complete, Transfer via WebSocket | ✅ Complete |

### Agent State Machine

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

**Valid State Transitions:**

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

## 6. Future Roadmap

| Phase | Name | Description | Key Features | Status |
|-------|------|-------------|--------------|--------|
| **Phase 3** | Logic Builder | A drag-and-drop UI for "Power Users" to modify queue criteria without code changes | Filters, weights, scoring configuration | 🔲 Planned |
| **Phase 4** | GCS Integration | Automated listeners for Google Cloud Storage buckets to replace manual file transfers | Event-driven ingestion, file processing pipelines | 🔲 Planned |

---

## 7. Project Structure

```
nexus-queue/
├── apps/
│   ├── agent-workspace/              # Angular 17+ frontend
│   │   └── src/
│   │       ├── app/
│   │       │   ├── core/
│   │       │   │   ├── guards/       # Auth guard
│   │       │   │   └── services/     # Auth, Queue, Socket services
│   │       │   └── features/
│   │       │       ├── login/        # Login component
│   │       │       └── workspace/    # Main workspace
│   │       │           └── components/
│   │       │               ├── header/
│   │       │               ├── sidebar/
│   │       │               ├── main-stage/   # iFrame container
│   │       │               └── action-bar/   # Dynamic actions
│   │       └── environments/
│   └── api-server/                   # NestJS backend
│       └── src/
│           └── app/
│               ├── gateway/          # WebSocket gateway
│               │   └── agent.gateway.ts
│               ├── services/         # Agent manager, task distributor
│               └── tasks/            # REST API endpoints
├── libs/
│   └── shared-models/                # Shared TypeScript interfaces
│       └── src/lib/
│           ├── task.interface.ts
│           └── agent.interface.ts
├── ARCHITECTURE.md                   # This document
├── BRANCH_STRATEGY.md                # Git workflow
└── AGENT.md                          # AI agent guidelines
```

---

## 8. Key Interfaces

### Task

```typescript
interface Task {
  id: string;
  externalId?: string;
  workType: string;              // "ORDERS", "RETURNS", "CLAIMS"
  title: string;
  description?: string;
  payloadUrl: string;            // URL loaded in iFrame
  metadata?: Record<string, string>;
  priority: number;              // 0-10, lower = higher priority
  skills?: string[];
  queue?: string;
  status: TaskStatus;

  // Timestamps (ISO 8601)
  createdAt: string;
  reservedAt?: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  dispositionedAt?: string;

  // Performance metrics (seconds)
  handleTime?: number;           // startedAt → completedAt
  wrapUpTime?: number;           // completedAt → dispositionedAt
  totalTime?: number;            // reservedAt → dispositionedAt

  // Configuration
  reservationTimeout?: number;   // Max seconds in RESERVED state
  actions?: TaskAction[];        // Dynamic action buttons
  disposition?: TaskDisposition;
}

type TaskStatus = 'PENDING' | 'RESERVED' | 'ACTIVE' | 'WRAP_UP' | 'COMPLETED' | 'TRANSFERRED' | 'EXPIRED';
```

### Agent State

```typescript
type AgentState = 'OFFLINE' | 'IDLE' | 'RESERVED' | 'ACTIVE' | 'WRAP_UP';
```

### Task Action

```typescript
interface TaskAction {
  id: string;
  label: string;
  type: 'COMPLETE' | 'TRANSFER' | 'LINK' | 'CUSTOM';
  icon?: string;
  url?: string;                  // For LINK type
  dispositionCode?: string;      // For COMPLETE type
  primary?: boolean;
}
```

---

## 9. References

| Resource | Location |
|----------|----------|
| Frontend App | `apps/agent-workspace` |
| Backend API | `apps/api-server` |
| Shared Models | `libs/shared-models` |
| This Document | `ARCHITECTURE.md` |
