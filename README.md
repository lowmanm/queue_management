# Nexus Queue - Queue Management System

A monorepo containing an Angular frontend and NestJS backend for queue management.

## Project Structure

```
/
├── apps/
│   ├── agent-workspace/    # Angular 17+ frontend
│   └── api-server/         # NestJS backend
├── libs/
│   └── shared-models/      # Shared TypeScript interfaces
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
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

Or start them individually:

```bash
# Start the API server (http://localhost:3000/api)
npm run start:api

# Start the Angular app (http://localhost:4200)
npm run start:web
```

### Build

```bash
npm run build:all
```

## Applications

### Agent Workspace (Angular)

The frontend application for agents to manage their queue tasks.

**Features:**
- Auto-login in development mode (Test_Agent_01)
- Status toggle (Available/Busy)
- Task info sidebar
- iFrame-based task display

### API Server (NestJS)

The backend API server.

**Endpoints:**
- `GET /api/tasks/next` - Get the next available task

## Shared Models

The `@nexus-queue/shared-models` library contains shared TypeScript interfaces:

```typescript
interface Task {
  id: string;
  title: string;
  payloadUrl: string;
  priority: number;
  status: 'PENDING' | 'ASSIGNED' | 'COMPLETED';
}
```
