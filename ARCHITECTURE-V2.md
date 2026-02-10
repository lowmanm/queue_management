# Nexus Queue — Architecture V2: Orchestration Redesign

## 1. Problem Statement

The current system has strong building blocks — Pipelines, Routing, Rules, Volume Loaders, Dispositions, Work States, RBAC — but they operate as **isolated modules** rather than a unified orchestration flow. Tasks move through the system via ad-hoc service calls rather than a defined pipeline.

### Current Flow (Fragmented)

```
VolumeLoader ──→ TaskSourceService (PendingOrders array)
                         │
                         ▼
                 TaskDistributorService ──→ TasksService (separate Task array)
                         │                          │
                    RuleEngine                  AgentGateway
                    (optional)              (WebSocket push)
                         │                          │
                    Pipeline?                  AgentManager
                  (disconnected)            (state tracking)
```

**Key gaps:**
- `PipelineService` has routing rules but is not in the task distribution path
- `TasksService` and `TaskSourceService` maintain separate task stores
- `RuleEngine` is applied during distribution but not connected to Pipeline routing
- No durable queue — tasks live in JS arrays, lost on restart
- No Dead Letter Queue — failed/timed-out tasks vanish
- SLA is defined but never enforced
- No task reassignment on agent failure
- Priority is a sort, not a proper priority queue

---

## 2. Target Architecture

### Design Principle: Pipeline-Centric Orchestration

Everything flows through a **Pipeline**. A Pipeline is the single organizing concept that connects ingestion, routing, queuing, distribution, and completion.

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
│                    AGENT POOLS (The Workers)                                 │
│                                                                             │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐        │
│  │  Orders Team     │   │  Returns Team    │   │  Claims Team     │        │
│  │  ┌────┐ ┌────┐   │   │  ┌────┐ ┌────┐   │   │  ┌────┐ ┌────┐   │        │
│  │  │ A1 │ │ A2 │   │   │  │ A3 │ │ A4 │   │   │  │ A5 │ │ A6 │   │        │
│  │  └────┘ └────┘   │   │  └────┘ └────┘   │   │  └────┘ └────┘   │        │
│  └──────────────────┘   └──────────────────┘   └──────────────────┘        │
│                                                                             │
│                    WebSocket Gateway (Force Mode Push)                       │
│                    Agent State Machine (Work States)                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Components Redesign

### 3.1 Pipeline Orchestrator (NEW — replaces fragmented flow)

The **single entry point** for all tasks entering the system. Every record — whether from CSV upload, VolumeLoader, API, or manual entry — goes through this service.

```typescript
// Orchestration flow (pseudocode)
class PipelineOrchestratorService {

  async ingestTask(input: TaskIngestionInput): Promise<OrchestrationResult> {
    // Step 1: VALIDATE — check required fields against pipeline schema
    const validated = this.validateAgainstSchema(input, pipeline);

    // Step 2: TRANSFORM — apply Rule Engine modifications
    const transformed = this.ruleEngine.evaluateTask(validated);

    // Step 3: ROUTE — determine target queue via Pipeline routing rules
    const routingDecision = this.pipelineService.routeTask(pipeline.id, transformed);

    // Step 4: ENQUEUE — place into the correct priority queue
    const queued = this.queueManager.enqueue(routingDecision.queueId, transformed);

    // Step 5: DISTRIBUTE — attempt immediate assignment if agents available
    this.distributionEngine.tryDistribute(routingDecision.queueId);

    return { taskId: queued.id, queueId: routingDecision.queueId, status: 'QUEUED' };
  }
}
```

**What changes:**
- VolumeLoader calls `orchestrator.ingestTask()` instead of `taskSourceService.addPendingOrder()`
- CSV upload calls `orchestrator.ingestTask()` instead of direct parsing
- Manual task creation calls `orchestrator.ingestTask()`
- All tasks get validated, transformed, routed, and queued uniformly

### 3.2 Queue Manager (NEW — replaces JS arrays)

A proper **priority queue** implementation that supports named queues, priority levels, and dead letter handling.

```typescript
interface QueueManager {
  // Core operations
  enqueue(queueId: string, task: QueuedTask): QueuedTask;
  dequeue(queueId: string): QueuedTask | null;          // Highest priority first
  peek(queueId: string): QueuedTask | null;              // Look without removing
  requeue(task: QueuedTask, reason: string): void;       // Return to queue (agent failure)

  // Priority operations
  dequeueByPriority(queueId: string, maxPriority: number): QueuedTask | null;
  reprioritize(taskId: string, newPriority: number, reason: string): void;

  // Dead Letter Queue
  moveToDLQ(task: QueuedTask, reason: string): void;
  getDLQTasks(queueId?: string): QueuedTask[];
  retryFromDLQ(taskId: string): OrchestrationResult;

  // Observability
  getQueueDepth(queueId: string): number;
  getQueueStats(queueId: string): QueueHealthStats;
  getOldestTask(queueId: string): QueuedTask | null;
}
```

**Queue entry structure:**

```typescript
interface QueuedTask {
  id: string;                    // Task ID
  pipelineId: string;            // Source pipeline
  queueId: string;               // Current queue
  task: Task;                    // Full task payload
  priority: number;              // 1-10 (1 = highest)
  enqueuedAt: string;            // When entered queue
  slaDeadline?: string;          // When SLA breaches
  retryCount: number;            // Times re-queued after failure
  maxRetries: number;            // From pipeline config
  lastFailureReason?: string;    // Why last assignment failed
}
```

**Priority queue behavior:**
- Dequeue always returns the **lowest priority number** (highest urgency)
- Within same priority, **FIFO** (oldest first)
- SLA-breaching tasks get automatic priority boost
- Tasks exceeding `maxRetries` go to DLQ

### 3.3 Distribution Engine (REFACTORED — from TaskDistributorService)

Responsible **only** for matching queued tasks to available agents. No longer fetches tasks from sources — it pulls from the Queue Manager.

```typescript
interface DistributionEngine {
  // Called when: agent becomes IDLE, new task enqueued, task returned to queue
  tryDistribute(queueId: string): DistributionResult;

  // Try all queues an agent has access to (priority order)
  tryDistributeToAgent(agentId: string): DistributionResult;

  // Batch distribution across all active queues
  runDistributionCycle(): DistributionCycleResult;
}
```

**Distribution algorithm:**

```
1. Get all IDLE agents with access to this queue
2. Get next task from queue (highest priority / oldest)
3. Score agents using RoutingService (skill match, workload, idle time)
4. Assign task to best-scoring agent
5. Start reservation timer
6. If no agents available → task stays in queue (checked again on next agent:ready)
```

**Key improvement: Task Reassignment**

```
Agent fails/times out → Task returns to Queue Manager via requeue()
                       → retryCount incremented
                       → If retryCount >= maxRetries → DLQ
                       → Otherwise → Distribution Engine retries immediately
```

### 3.4 SLA Monitor (NEW)

Runs on an interval. Checks all queued tasks against their SLA deadlines and takes corrective action.

```typescript
interface SLAMonitorService {
  // Runs every N seconds (configurable per pipeline)
  checkSLACompliance(): SLACheckResult;

  // Actions when SLA is at risk
  escalateTask(taskId: string, reason: string): void;       // Boost priority
  alertManager(queueId: string, breach: SLABreach): void;   // Notify via WebSocket
  redistributeTask(taskId: string): void;                    // Move to overflow queue
}
```

**SLA enforcement flow:**

```
For each queued task:
  1. Calculate time-in-queue = now - enqueuedAt
  2. Compare against pipeline.sla.maxQueueWaitTime
  3. If approaching threshold (80%):
     → Boost priority by 2 levels
     → Emit 'sla:warning' event to manager dashboard
  4. If breached (100%):
     → Boost to priority 1
     → Emit 'sla:breach' event
     → If configured: move to overflow/escalation queue
  5. Track metrics for service level reporting
```

### 3.5 Task Lifecycle (UNIFIED)

Replace the three separate task stores (`TasksService.pendingTasks`, `TasksService.activeTasks`, `TaskSourceService.pendingOrders`) with a **single task store** that tracks the full lifecycle.

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ INGESTED │────→│  QUEUED  │────→│ RESERVED │────→│  ACTIVE  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │                │                 │
                      │           timeout/reject         │
                      │                │                 │
                      │    ┌───────────┘                 │
                      │    │                             │
                      │    ▼                             ▼
                      │  ┌──────────┐             ┌──────────┐
                      │  │ RE-QUEUED│             │ WRAP_UP  │
                      │  └──────────┘             └──────────┘
                      │                                 │
                      │                                 ▼
                      │                           ┌──────────┐
                      │                           │COMPLETED │
                      │                           └──────────┘
                      │
                      │  (maxRetries exceeded)
                      ▼
                 ┌──────────┐
                 │   DLQ    │ → Manual inspection / retry / discard
                 └──────────┘
```

**Task status values (expanded):**

```typescript
type TaskStatus =
  | 'INGESTED'     // Received by orchestrator, being validated
  | 'QUEUED'       // In priority queue, awaiting distribution
  | 'RESERVED'     // Offered to agent, awaiting accept/reject
  | 'ACTIVE'       // Agent working on task
  | 'WRAP_UP'      // Agent completing disposition
  | 'COMPLETED'    // Fully done
  | 'TRANSFERRED'  // Moved to another queue/agent
  | 'REQUEUED'     // Returned to queue after failure
  | 'DLQ'          // In dead letter queue
  | 'EXPIRED'      // SLA fully breached, removed from queue
```

---

## 4. Component Responsibility Matrix

| Component | Current State | Target State | Change Type |
|-----------|--------------|--------------|-------------|
| **PipelineOrchestratorService** | Does not exist | Central ingestion point | **NEW** |
| **QueueManagerService** | JS arrays in TasksService | Priority queue with DLQ | **NEW** |
| **DistributionEngineService** | TaskDistributorService (mixed concerns) | Pure agent-task matching | **REFACTOR** |
| **SLAMonitorService** | Does not exist | Periodic SLA checker | **NEW** |
| **TaskStoreService** | Split across 3 services | Single task lifecycle store | **NEW** |
| **PipelineService** | Isolated routing rules | Connected to orchestrator flow | **WIRE** |
| **RuleEngineService** | Applied ad-hoc | Called by orchestrator transform step | **WIRE** |
| **RoutingService** | Standalone scoring | Called by distribution engine | **WIRE** (already partially) |
| **VolumeLoaderService** | Pushes to TaskSourceService | Pushes to PipelineOrchestrator | **REWIRE** |
| **AgentGateway** | Calls TaskDistributor directly | Calls DistributionEngine | **REWIRE** |
| **TasksService** | Pending/active arrays | Deprecated (replaced by QueueManager + TaskStore) | **DEPRECATE** |
| **TaskSourceService** | PendingOrders array | Thin adapter for CSV parsing only | **SLIM DOWN** |

---

## 5. Queue Designer Configuration Model

Everything the Queue Designer team configures — and how it maps to the orchestration flow:

```
DESIGNER CONFIGURES:                    ORCHESTRATOR USES:
═══════════════════                     ══════════════════

Pipeline                         ──→   Orchestrator knows which pipeline to route through
  ├── Data Schema                ──→   Step 1: VALIDATE (field types, required fields)
  ├── Routing Rules              ──→   Step 3: ROUTE (conditions → target queue)
  │     ├── Conditions           ──→   Field matching (workType, priority, metadata.*)
  │     └── Actions              ──→   Target queue, priority override, skill additions
  ├── Default Routing            ──→   Fallback when no rules match
  ├── SLA Config                 ──→   SLA Monitor thresholds and escalation behavior
  └── Allowed Work Types         ──→   Ingestion filter

Pipeline Queues                  ──→   Queue Manager creates named queues
  ├── Priority                   ──→   Queue processing order (which queue to drain first)
  ├── Required Skills            ──→   Distribution Engine agent filtering
  ├── Max Capacity               ──→   Queue Manager enforces backpressure
  └── SLA Overrides              ──→   SLA Monitor per-queue thresholds

Rule Sets (Logic Builder)        ──→   Step 2: TRANSFORM (modify task before routing)
  ├── Conditions                 ──→   When to apply (field matching)
  └── Actions                    ──→   Priority changes, skill additions, metadata

Routing Strategies               ──→   Distribution Engine algorithm selection
  ├── Algorithm                  ──→   round-robin, skill-weighted, most-idle, etc.
  ├── Skill Matching             ──→   strict, flexible, best-match modes
  ├── Workload Balancing         ──→   Max tasks, idle time weighting
  └── Fallback Behavior          ──→   What to do when no agent matches

Dispositions                     ──→   WRAP_UP → COMPLETED transition rules
  ├── Categories                 ──→   Outcome classification
  ├── Requires Note              ──→   Agent UI enforcement
  └── Queue/WorkType Scoping     ──→   Context-aware disposition display

Work States                      ──→   Agent availability for distribution
  ├── System States              ──→   READY = available, ACTIVE = working
  ├── Custom States              ──→   BREAK, LUNCH, etc. = unavailable
  └── Max Duration/Approval      ──→   Manager alerts and auto-return

Volume Loaders                   ──→   Data source ingestion configuration
  ├── Source Type                ──→   How to fetch data (GCS, S3, CSV, HTTP)
  ├── Field Mappings             ──→   Transform source data → Task fields
  ├── Schedule                   ──→   When to poll for new data
  └── Pipeline Assignment        ──→   Which pipeline to route through
```

---

## 6. Orchestration Workflow (Step by Step)

### Step 1: INGESTION

```
Data arrives (CSV upload, VolumeLoader poll, API call, manual entry)
                    │
                    ▼
        PipelineOrchestratorService.ingestTask()
                    │
                    ├── Determine target pipeline (from VolumeLoader config or explicit)
                    ├── Validate against pipeline.dataSchema
                    ├── Create Task record in TaskStore (status: INGESTED)
                    └── Proceed to Transform
```

### Step 2: TRANSFORM (Rule Engine)

```
Task enters Rule Engine
        │
        ├── Filter applicable RuleSets (by workType, queue)
        ├── Evaluate rules in priority order
        │     ├── Check conditions (field matching with AND/OR logic)
        │     └── Apply actions (set_priority, add_skill, set_metadata, etc.)
        ├── Apply pipeline defaults for missing fields
        └── Output: transformed Task with final priority, skills, metadata
```

### Step 3: ROUTE (Pipeline Routing Rules)

```
Transformed task enters Pipeline Router
        │
        ├── Evaluate routing rules in priority order
        │     ├── Match conditions (workType, priority, metadata fields)
        │     └── If match → use targetQueueId
        ├── If no match → apply defaultRouting behavior
        │     ├── route_to_queue → use defaultQueueId
        │     ├── hold → park in holding area
        │     └── reject → send to DLQ with "no route" reason
        └── Output: target queueId + any priority/skill overrides
```

### Step 4: ENQUEUE (Queue Manager)

```
Task placed in target queue
        │
        ├── Calculate SLA deadline (enqueuedAt + pipeline.sla.maxQueueWaitTime)
        ├── Check queue capacity (maxCapacity)
        │     ├── If at capacity → apply backpressure (hold or overflow queue)
        │     └── If room → insert into priority queue
        ├── Update task status: QUEUED
        ├── Update queue stats (depth, oldest task age)
        └── Trigger distribution attempt
```

### Step 5: DISTRIBUTE (Agent Assignment)

```
Distribution Engine attempts assignment
        │
        ├── Find idle agents with access to this queue
        ├── Filter by required skills (from queue + task)
        ├── Score agents using active RoutingStrategy
        │     ├── Skill score (proficiency match)
        │     ├── Workload score (task count, utilization)
        │     ├── Idle time score (longest idle preferred)
        │     └── Performance score (historical handle time)
        ├── Select best-scoring agent
        ├── Reserve task for agent:
        │     ├── Update task status: RESERVED
        │     ├── Update agent state: RESERVED
        │     ├── Push task via WebSocket (task:assigned event)
        │     └── Start reservation timer
        └── If no agents available → task stays in queue
```

### Step 6: WORK (Agent Actions)

```
Agent receives task via WebSocket
        │
        ├── ACCEPT → status: ACTIVE, agent state: ACTIVE
        │     └── Agent works task (views in iFrame, takes actions)
        │
        ├── REJECT → status: REQUEUED, agent state: IDLE
        │     └── Task returns to queue (retryCount++)
        │
        └── TIMEOUT → status: REQUEUED, agent state: IDLE
              └── Task returns to queue (retryCount++)
```

### Step 7: COMPLETION (Disposition)

```
Agent completes work
        │
        ├── COMPLETE action → status: WRAP_UP, agent state: WRAP_UP
        │     └── Agent selects disposition
        │           ├── If requiresNote → show note modal
        │           └── Submit disposition
        │                 ├── Record TaskCompletion
        │                 ├── Update task status: COMPLETED
        │                 ├── Update agent state: IDLE
        │                 ├── Update metrics (handle time, completion count)
        │                 └── Trigger distribution for next task
        │
        └── TRANSFER action → status: TRANSFERRED
              ├── Determine target queue
              ├── Re-enqueue in target queue
              └── Update agent state: IDLE
```

### Continuous: SLA MONITOR

```
Every 10 seconds (configurable):
        │
        ├── For each active queue:
        │     ├── Check oldest task age vs. SLA threshold
        │     ├── If ≥ 80% of SLA → boost priority, emit sla:warning
        │     ├── If ≥ 100% of SLA → priority 1, emit sla:breach
        │     └── If ≥ 150% of SLA → move to escalation queue
        │
        ├── For each reserved task:
        │     └── If reservation time > threshold → force timeout
        │
        └── Emit queue health metrics to manager dashboard
```

---

## 7. Advanced Patterns

### 7.1 Priority Queuing

Each pipeline queue maintains a min-heap ordered by `(priority, enqueuedAt)`:

```
Queue: "orders-standard"
┌─────────────────────────────────────────────┐
│ Priority 1: [Task-042 (2m ago), Task-089 (1m ago)]  ← Dequeued first
│ Priority 3: [Task-101 (5m ago)]
│ Priority 5: [Task-067 (8m ago), Task-023 (3m ago)]
│ Priority 7: [Task-112 (1m ago)]
└─────────────────────────────────────────────┘
```

Agents **always** check their accessible queues in queue-priority order, and within each queue, get the highest-priority (lowest number) task.

### 7.2 Dead Letter Queue (DLQ)

```
When a task enters DLQ:
  1. Record reason (max_retries_exceeded, no_route, schema_validation_failed, sla_expired)
  2. Preserve full task payload and history
  3. Emit dlq:task_added event to admin/manager dashboards
  4. Task is visible in DLQ monitor UI

Manager/Admin actions on DLQ tasks:
  - RETRY: Re-ingest through orchestrator (fresh attempt)
  - REASSIGN: Force-assign to specific agent
  - REROUTE: Move to different pipeline/queue
  - DISCARD: Mark as permanently failed (with reason/note)
```

### 7.3 Backpressure

When a queue reaches `maxCapacity`:

```
Option 1 (OVERFLOW):  Route to overflow queue (lower priority agents)
Option 2 (HOLD):      Hold at ingestion layer, retry on next cycle
Option 3 (REJECT):    Return error to producer (VolumeLoader records as failed)
Option 4 (SHED):      Accept but immediately DLQ with "capacity_exceeded"
```

Configurable per pipeline via `pipeline.defaults.backpressureStrategy`.

### 7.4 Durable Queue (Future — Database-Backed)

Current implementation: In-memory Maps (acceptable for POC/MVP).
Target implementation: PostgreSQL-backed queue table.

```sql
-- Future: queue_tasks table
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
  disposition   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for dequeue operation (priority queue behavior)
CREATE INDEX idx_queue_dequeue
  ON queue_tasks (queue_id, priority ASC, enqueued_at ASC)
  WHERE status = 'QUEUED';
```

For now, the in-memory QueueManager uses sorted insertion to maintain priority order.

---

## 8. Implementation Phases

### Phase 2.5: Orchestration Core (Current Sprint)

| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Create `QueueManagerService` with priority queue + DLQ | **P1** | Medium |
| 2 | Create `PipelineOrchestratorService` (validate → transform → route → enqueue) | **P1** | Medium |
| 3 | Create `TaskStoreService` (unified task lifecycle tracking) | **P1** | Medium |
| 4 | Refactor `DistributionEngine` to pull from QueueManager | **P1** | Medium |
| 5 | Rewire `VolumeLoaderService` to call Orchestrator | **P2** | Small |
| 6 | Rewire `AgentGateway` to use DistributionEngine | **P2** | Small |
| 7 | Create `SLAMonitorService` | **P2** | Medium |
| 8 | Deprecate `TasksService` (replaced by QueueManager + TaskStore) | **P3** | Small |

### Phase 3: Logic Builder + Designer UI

- Visual rule builder connected to RuleEngine
- Pipeline creation wizard
- Queue health dashboard for managers
- DLQ monitor with retry/discard actions

### Phase 4: Persistence + Production

- PostgreSQL integration for task store + queue
- Redis for real-time queue operations
- Event sourcing for audit trail
- Horizontal scaling (multiple API server instances)

---

## 9. Module Dependency Graph (Target)

```
VolumeLoaderService ──→ PipelineOrchestratorService
CSV Upload          ──→ PipelineOrchestratorService
Manual Entry        ──→ PipelineOrchestratorService
                              │
                    ┌─────────┼──────────┐
                    ▼         ▼          ▼
              RuleEngine  PipelineService  TaskStoreService
              (transform) (route)          (lifecycle)
                    │         │
                    └────┬────┘
                         ▼
                   QueueManagerService
                    (enqueue/dequeue)
                         │
                         ▼
                  DistributionEngine
                    (agent matching)
                    ┌────┤
                    ▼    ▼
             RoutingService  AgentManagerService
             (scoring)       (state tracking)
                    │              │
                    └──────┬───────┘
                           ▼
                     AgentGateway
                     (WebSocket push)
                           │
                           ▼
                    SLAMonitorService
                    (periodic check)
```

---

## 10. Mapping to Reference Model

| Reference Component | Nexus Queue Implementation |
|---------------------|---------------------------|
| **Data Source / Producer** | VolumeLoaderService (GCS, S3, SFTP, HTTP, LOCAL, CSV upload) |
| **Persistence Layer** | TaskStoreService (in-memory now, PostgreSQL later) |
| **Scheduler** | VolumeLoaderService scheduling + SLAMonitorService intervals |
| **Orchestrator** | PipelineOrchestratorService (validate → transform → route → enqueue) |
| **Queue Manager** | QueueManagerService (priority queues, DLQ, backpressure) |
| **Agent Interface** | Agent Workspace (Angular) + Manager Dashboard + Queue Monitor |
| **Priority Queuing** | QueueManagerService min-heap per queue |
| **Dead Letter Queue** | QueueManagerService.moveToDLQ() + DLQ monitor UI |
| **Durable Queues** | Phase 4: PostgreSQL-backed queue table |
| **Fault Tolerance** | Task requeue on agent failure + DLQ on max retries |

---

*Last Updated: February 2026*
*Version: 2.0*
