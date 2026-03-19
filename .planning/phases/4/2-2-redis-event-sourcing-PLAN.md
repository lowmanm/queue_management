<plan>
  <name>Wave 2 — Redis Real-time Layer + Event Sourcing + Audit Log</name>
  <wave>2</wave>
  <requirements>P4-010, P4-011, P4-012, P4-013, P4-020, P4-021, P4-022, P4-023</requirements>
  <files>
    <!-- Redis module -->
    apps/api-server/src/app/redis/redis.module.ts (NEW)
    apps/api-server/src/app/redis/redis.service.ts (NEW)
    apps/api-server/src/app/redis/redis.constants.ts (NEW)
    apps/api-server/src/app/redis/index.ts (NEW)

    <!-- Migrated services -->
    apps/api-server/src/app/services/agent-manager.service.ts
    apps/api-server/src/app/services/agent-session.service.ts
    apps/api-server/src/app/services/task-distributor.service.ts

    <!-- Event store -->
    apps/api-server/src/app/entities/task-event.entity.ts (NEW)
    apps/api-server/src/app/services/event-store.service.ts (NEW)
    apps/api-server/src/app/services/pipeline-orchestrator.service.ts
    apps/api-server/src/app/gateway/agent.gateway.ts
    apps/api-server/src/app/services/queue-manager.service.ts
    apps/api-server/src/app/services/sla-monitor.service.ts

    <!-- Audit log API -->
    apps/api-server/src/app/audit-log/audit-log.controller.ts (NEW)
    apps/api-server/src/app/audit-log/audit-log.module.ts (NEW)
    apps/api-server/src/app/audit-log/index.ts (NEW)
    apps/api-server/src/app/app.module.ts

    <!-- Frontend audit log viewer -->
    apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.ts (NEW)
    apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.html (NEW)
    apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.scss (NEW)
    apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.spec.ts (NEW)
    apps/agent-workspace/src/app/app.routes.ts
    apps/agent-workspace/src/app/shared/components/layout/app-shell.component.html (sidebar link)
  </files>
  <tasks>
    <task id="1">
      <name>Create RedisModule + RedisService</name>
      <action>
        Install packages:
          npm install ioredis
          npm install --save-dev @types/ioredis (if not already included in ioredis v5+)

        Note: ioredis v5+ ships its own TypeScript types — `@types/ioredis` is NOT needed.

        Create `apps/api-server/src/app/redis/redis.constants.ts`:
        - Export `REDIS_CLIENT` injection token: `export const REDIS_CLIENT = 'REDIS_CLIENT'`

        Create `apps/api-server/src/app/redis/redis.service.ts` (`@Injectable()`):
        - Wraps an `ioredis` client instance
        - Provides typed helper methods used by agent services:
          - `hset(key: string, field: string, value: string): Promise&lt;void&gt;`
          - `hget(key: string, field: string): Promise&lt;string | null&gt;`
          - `hgetall(key: string): Promise&lt;Record&lt;string, string&gt;&gt;`
          - `hdel(key: string, field: string): Promise&lt;void&gt;`
          - `del(key: string): Promise&lt;void&gt;`
          - `expire(key: string, ttlSeconds: number): Promise&lt;void&gt;`
          - `publish(channel: string, message: string): Promise&lt;void&gt;`
          - `subscribe(channel: string, callback: (msg: string) =&gt; void): void`
          - `set(key: string, value: string, options?: { ttl?: number }): Promise&lt;void&gt;`
          - `get(key: string): Promise&lt;string | null&gt;`

        Create `apps/api-server/src/app/redis/redis.module.ts` (`@Global() @Module()`):
        - Provides `REDIS_CLIENT` via a factory provider reading `REDIS_URL` env var
          (default: `redis://localhost:6379`)
        - If connection fails (Redis not running), log a warning but do NOT crash —
          the service gracefully falls back to in-memory behavior when `REDIS_URL` is unset
        - Exports `RedisService`

        Add `RedisModule` to `app.module.ts` imports.
      </action>
      <files>
        package.json
        apps/api-server/src/app/redis/redis.constants.ts
        apps/api-server/src/app/redis/redis.service.ts
        apps/api-server/src/app/redis/redis.module.ts
        apps/api-server/src/app/redis/index.ts
        apps/api-server/src/app/app.module.ts
      </files>
      <verify>
        npx nx build api-server (no TypeScript errors)
      </verify>
      <done>
        - ioredis installed
        - RedisModule and RedisService created, globally provided
        - Graceful degradation when REDIS_URL is unset
        - Build passes
      </done>
    </task>

    <task id="2">
      <name>Migrate AgentManagerService and AgentSessionService to Redis</name>
      <action>
        **AgentManagerService** (`services/agent-manager.service.ts`):

        Replace `agents: Map&lt;string, ConnectedAgent&gt;` with Redis HASH:
        - Key pattern: `agent:state:{agentId}` → JSON-serialized `ConnectedAgent`
        - On agent connect: `redisService.set('agent:state:{agentId}', JSON.stringify(agent), { ttl: 300 })`
        - On agent disconnect: `redisService.del('agent:state:{agentId}')`
        - On state update: `redisService.set(...)` with TTL refresh
        - `getAllAgents()`: Use `SCAN` pattern `agent:state:*` to collect all agent keys, then `MGET`

        Replace `socketToAgent: Map&lt;string, string&gt;` with Redis HASH:
        - Key: `socket:agent:map` (single hash with socketId → agentId fields)
        - `redisService.hset('socket:agent:map', socketId, agentId)`
        - `redisService.hget('socket:agent:map', socketId)`
        - `redisService.hdel('socket:agent:map', socketId)` on disconnect

        Implement heartbeat: On each agent state update, refresh the TTL to 300s.
        If TTL expires (agent crashed without disconnect), agent is automatically removed.

        **AgentSessionService** (`services/agent-session.service.ts`):

        Replace `sessions: Map&lt;string, AgentSession&gt;` with Redis:
        - Key: `session:{agentId}` → JSON-serialized `AgentSession`, TTL: 28800s (8h)
        - `getSession(agentId)`: `redisService.get('session:{agentId}')`
        - `setSession(agentId, session)`: `redisService.set('session:{agentId}', JSON.stringify(session), { ttl: 28800 })`
        - `deleteSession(agentId)`: `redisService.del('session:{agentId}')`

        Keep `stateHistory: StateChangeEvent[]` writes going to PostgreSQL
        (via AgentSessionService already writing to `state_events` table from Plan 2-1).

        Keep `workStateConfigs: Map` as-is if already seeded to DB (query on startup).

        All methods become async where needed.
      </action>
      <files>
        apps/api-server/src/app/services/agent-manager.service.ts
        apps/api-server/src/app/services/agent-session.service.ts
        apps/api-server/src/app/gateway/agent.gateway.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx test api-server
      </verify>
      <done>
        - AgentManagerService: connected agent state stored in Redis
        - AgentSessionService: active sessions stored in Redis with 8h TTL
        - Socket-to-agent mapping uses Redis HASH
        - Agent state auto-expires after 5-minute TTL if no heartbeat
        - Build and tests pass
      </done>
    </task>

    <task id="3">
      <name>Add Redis pub/sub for multi-instance task distribution</name>
      <action>
        Update `TaskDistributorService` to use Redis pub/sub for task distribution signals.

        **Current behavior**: `TaskDistributorService.tryDistribute()` directly calls
        `AgentManagerService.getIdleAgents()` and then pushes via gateway — all synchronous
        within a single process.

        **New behavior**:
        - When a task is enqueued, publish to Redis channel `nexus:task:distribute`:
          `redisService.publish('nexus:task:distribute', JSON.stringify({ queueId, taskId }))`
        - Each API instance subscribes to `nexus:task:distribute` on startup
        - On message received, the instance calls `tryDistribute(queueId)` — only one instance
          will successfully dequeue the task (atomic `BRPOPLPUSH` pattern or optimistic locking
          via TypeORM transaction)
        - This ensures that with multiple API instances behind a load balancer, exactly one
          instance handles each task distribution

        Implementation:
        - In `TaskDistributorService.onModuleInit()`, subscribe to `nexus:task:distribute`
        - Create a separate `ioredis` subscriber client (ioredis requires separate client for subscribe mode)
          — expose a `createSubscriberClient()` factory in `RedisModule`
        - Use a short-lived pessimistic lock on the queued_tasks row via `SELECT ... FOR UPDATE SKIP LOCKED`
          in QueueManagerService.dequeue() to prevent double-distribution

        Note: Add TypeORM QueryRunner usage in QueueManagerService.dequeue() to wrap
        the SELECT ... FOR UPDATE SKIP LOCKED in a transaction.
      </action>
      <files>
        apps/api-server/src/app/services/task-distributor.service.ts
        apps/api-server/src/app/services/queue-manager.service.ts
        apps/api-server/src/app/redis/redis.module.ts
        apps/api-server/src/app/redis/redis.service.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx test api-server
      </verify>
      <done>
        - Redis pub/sub channel `nexus:task:distribute` used for task distribution
        - QueueManagerService.dequeue() uses SELECT FOR UPDATE SKIP LOCKED (PostgreSQL)
        - Multiple API instances can run without double-distributing tasks
        - Build and tests pass
      </done>
    </task>

    <task id="4">
      <name>Create EventStoreService + emit domain events across task lifecycle</name>
      <action>
        Create `apps/api-server/src/app/entities/task-event.entity.ts`:
        ```
        @Entity('task_events')
        class TaskEventEntity:
          id: uuid (primary, generated)
          eventType: varchar(50)
          aggregateId: uuid
          aggregateType: varchar(20) — 'task' | 'agent'
          payload: jsonb
          occurredAt: timestamptz (CreateDateColumn)
          pipelineId: uuid nullable
          agentId: uuid nullable
          sequenceNum: bigint (GENERATED ALWAYS AS IDENTITY via raw SQL — or use CreateDateColumn ordering)
        ```
        Add indexes: (aggregateType, aggregateId, occurredAt) and (eventType, occurredAt DESC).

        Create `apps/api-server/src/app/services/event-store.service.ts`:
        - `@Injectable()` service
        - Inject `@InjectRepository(TaskEventEntity) private eventRepo: Repository&lt;TaskEventEntity&gt;`
        - Single public method: `emit(event: Omit&lt;AuditEvent, 'id' | 'occurredAt' | 'sequenceNum'&gt;): Promise&lt;void&gt;`
          - Creates and saves a TaskEventEntity
          - Throws on DB error but NEVER crashes caller — wrap in try/catch, log on error

        Register `TaskEventEntity` in `DatabaseModule` entities + `TypeOrmModule.forFeature` in `ServicesModule`.

        **Emit domain events from callsites:**

        | Callsite | Event emitted |
        |---|---|
        | `PipelineOrchestratorService.process()` — after validate | `task.ingested` |
        | `QueueManagerService.enqueue()` | `task.queued` |
        | `TaskDistributorService.assign()` | `task.assigned` |
        | `AgentGateway` on `task:accept` | `task.accepted` |
        | `AgentGateway` on `task:reject` | `task.rejected` |
        | `AgentGateway` on `agent:disposition-complete` | `task.completed` |
        | `QueueManagerService.moveToDLQ()` | `task.dlq` |
        | `QueuesService/DlqController` on retry | `task.retried` |
        | `AgentSessionService.changeState()` | `agent.state_changed` |
        | `SLAMonitorService` on warning | `sla.warning` |
        | `SLAMonitorService` on breach | `sla.breach` |

        Inject `EventStoreService` into each callsite service. Events must NOT block the
        main flow — fire-and-forget with error logging.
      </action>
      <files>
        apps/api-server/src/app/entities/task-event.entity.ts
        apps/api-server/src/app/services/event-store.service.ts
        apps/api-server/src/app/services/pipeline-orchestrator.service.ts
        apps/api-server/src/app/services/queue-manager.service.ts
        apps/api-server/src/app/services/task-distributor.service.ts
        apps/api-server/src/app/services/agent-session.service.ts
        apps/api-server/src/app/services/sla-monitor.service.ts
        apps/api-server/src/app/gateway/agent.gateway.ts
        apps/api-server/src/app/queues/queues.service.ts
        apps/api-server/src/app/services/services.module.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx test api-server
      </verify>
      <done>
        - TaskEventEntity created with correct indexes
        - EventStoreService.emit() persists events to PostgreSQL
        - All 11 domain event types emitted from correct callsites
        - Events are fire-and-forget (do not block task flow)
        - Build and tests pass
      </done>
    </task>

    <task id="5">
      <name>Create AuditLogController (API) + AuditLogComponent (frontend)</name>
      <action>
        **Backend: AuditLogController**

        Create `apps/api-server/src/app/audit-log/audit-log.controller.ts`:
        ```
        @Controller('audit-log')
        class AuditLogController:
          @Get()
          async query(@Query() params: AuditLogQueryDto): Promise&lt;AuditLogResponse&gt;
        ```

        Create `AuditLogQueryDto` with class-validator decorators:
        - `aggregateType?: string`
        - `aggregateId?: string`
        - `eventType?: string`
        - `startDate?: string` (ISO date string, parsed to Date)
        - `endDate?: string`
        - `page?: number` (default 1, min 1)
        - `limit?: number` (default 50, max 200)

        Service method (inline in module or separate service):
        - Build TypeORM `where` clause from query params
        - `eventRepo.findAndCount({ where, order: { occurredAt: 'DESC' }, skip: (page-1)*limit, take: limit })`
        - Return `AuditLogResponse` from shared models

        Create `apps/api-server/src/app/audit-log/audit-log.module.ts` and register in `app.module.ts`.

        **Frontend: AuditLogComponent**

        Create standalone `AuditLogComponent` at
        `apps/agent-workspace/src/app/features/admin/components/audit-log/`:

        Template features:
        - Filter bar: `aggregateType` (select: task/agent), `eventType` (select with all 11 types),
          date range inputs (startDate, endDate), `aggregateId` text input, Apply button
        - Event timeline table columns: Timestamp, Event Type, Aggregate (type + ID chip), Pipeline,
          Agent, Payload (expandable JSON viewer with toggle)
        - Pagination (previous/next with page info "Showing X–Y of Z events")
        - Loading state and empty state messages

        Use Angular `HttpClient` to call `GET /api/audit-log` with query params.
        Use `OnPush` change detection + `BehaviorSubject` for filter state.

        Add route to admin routes:
        `{ path: 'admin/audit-log', component: AuditLogComponent, canActivate: [adminGuard] }`

        Add sidebar navigation link for ADMIN users under "System" functional area.

        Write Vitest spec with TestBed: mock HttpClient, test filter form, pagination, empty state.
      </action>
      <files>
        apps/api-server/src/app/audit-log/audit-log.controller.ts
        apps/api-server/src/app/audit-log/audit-log.module.ts
        apps/api-server/src/app/audit-log/index.ts
        apps/api-server/src/app/app.module.ts
        apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.ts
        apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.html
        apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.scss
        apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.spec.ts
        apps/agent-workspace/src/app/app.routes.ts
        apps/agent-workspace/src/app/shared/components/layout/app-shell.component.html
      </files>
      <verify>
        npx nx build api-server
        npx nx build agent-workspace
        npx nx run api-server:eslint:lint
        npx nx lint agent-workspace
        npx nx test agent-workspace (AuditLogComponent spec passes)
      </verify>
      <done>
        - GET /api/audit-log returns paginated, filterable AuditLogResponse
        - AuditLogComponent renders event timeline with filters and pagination
        - Route /admin/audit-log protected by adminGuard
        - Sidebar link visible to ADMIN role only
        - Vitest spec passes
        - No new lint errors introduced
      </done>
    </task>
  </tasks>
  <dependencies>
    Wave 1 (1-1-debt-clearance-PLAN.md) — AuditEvent shared model interfaces needed
    Wave 2 Plan 1 (2-1-postgresql-persistence-PLAN.md) — TypeORM DataSource and entities must exist
    (Plans 2-1 and 2-2 can run IN PARALLEL since they touch different services)
  </dependencies>
</plan>
