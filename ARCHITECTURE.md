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

## 5. Phase 1: The Foundation (Current)

The initial build focuses on the **"Heartbeat"**—the connection between the Agent and the Server.

### Deliverables

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1 | Mock Authentication | Local development bypasses SSO for speed | ✅ Complete |
| 2 | The State Machine | Implementing the flow: `Idle → Reserved → Working → Disposition` | 🔄 In Progress |
| 3 | Basic Distribution | A "Next Task" API that serves work based on a simple priority integer | ✅ Complete |

### Agent State Machine

```
┌─────────┐     Task      ┌──────────┐    Accept    ┌─────────┐
│  Idle   │──────────────▶│ Reserved │─────────────▶│ Working │
│(Available)              └──────────┘              └─────────┘
└─────────┘                    │                         │
     ▲                         │ Timeout                 │ Complete
     │                         ▼                         ▼
     │                    ┌──────────┐             ┌───────────┐
     └────────────────────│ Released │◀────────────│Disposition│
                          └──────────┘   Wrap-up   │ (Wrap-up) │
                                                   └───────────┘
```

---

## 6. Future Roadmap

| Phase | Name | Description | Key Features |
|-------|------|-------------|--------------|
| **Phase 2** | Real-time Push | Implement WebSockets to eliminate the need for agents to click "Get Next" | Socket.io integration, Server-push notifications |
| **Phase 3** | Logic Builder | A drag-and-drop UI for "Power Users" to modify queue criteria without code changes | Filters, weights, scoring configuration |
| **Phase 4** | GCS Integration | Automated listeners for Google Cloud Storage buckets to replace manual file transfers | Event-driven ingestion, file processing pipelines |

---

## 7. Project Structure

```
nexus-queue/
├── apps/
│   ├── agent-workspace/          # Angular frontend
│   │   └── src/
│   │       ├── app/
│   │       │   ├── core/         # Guards, services
│   │       │   └── features/     # Workspace, login
│   │       └── environments/
│   └── api-server/               # NestJS backend
│       └── src/
│           └── app/
│               └── tasks/        # Task management
└── libs/
    └── shared-models/            # Shared TypeScript interfaces
        └── src/lib/
            └── task.interface.ts
```

---

## 8. Key Interfaces

### Task

```typescript
interface Task {
  id: string;
  title: string;
  payloadUrl: string;
  priority: number;
  status: 'PENDING' | 'ASSIGNED' | 'COMPLETED';
}
```

### Agent Status

```typescript
type AgentStatus = 'Available' | 'Busy';
```

---

## 9. References

| Resource | Location |
|----------|----------|
| Frontend App | `apps/agent-workspace` |
| Backend API | `apps/api-server` |
| Shared Models | `libs/shared-models` |
| This Document | `ARCHITECTURE.md` |
