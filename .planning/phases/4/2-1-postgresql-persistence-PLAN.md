<plan>
  <name>Wave 2 — PostgreSQL Persistence Layer</name>
  <wave>2</wave>
  <requirements>P4-001, P4-002, P4-003, P4-004, P4-005, P4-006, P4-007</requirements>
  <files>
    <!-- New package.json dependencies (install step) -->
    package.json

    <!-- Database module -->
    apps/api-server/src/app/database/database.module.ts (NEW)
    apps/api-server/src/app/database/data-source.ts (NEW)
    apps/api-server/src/app/database/index.ts (NEW)

    <!-- TypeORM entities -->
    apps/api-server/src/app/entities/task.entity.ts (NEW)
    apps/api-server/src/app/entities/queued-task.entity.ts (NEW)
    apps/api-server/src/app/entities/dlq-entry.entity.ts (NEW)
    apps/api-server/src/app/entities/pipeline.entity.ts (NEW)
    apps/api-server/src/app/entities/pipeline-queue.entity.ts (NEW)
    apps/api-server/src/app/entities/rule-set.entity.ts (NEW)
    apps/api-server/src/app/entities/rule.entity.ts (NEW)
    apps/api-server/src/app/entities/disposition.entity.ts (NEW)
    apps/api-server/src/app/entities/skill.entity.ts (NEW)
    apps/api-server/src/app/entities/agent-skill.entity.ts (NEW)
    apps/api-server/src/app/entities/task-source.entity.ts (NEW)
    apps/api-server/src/app/entities/volume-loader.entity.ts (NEW)
    apps/api-server/src/app/entities/volume-loader-run.entity.ts (NEW)
    apps/api-server/src/app/entities/work-state-config.entity.ts (NEW)
    apps/api-server/src/app/entities/user.entity.ts (NEW)
    apps/api-server/src/app/entities/team.entity.ts (NEW)
    apps/api-server/src/app/entities/index.ts (NEW)

    <!-- Migrations directory -->
    apps/api-server/src/migrations/ (NEW directory)

    <!-- Seed script -->
    apps/api-server/src/app/database/seed.ts (NEW)
    apps/api-server/src/app/database/seed-data.ts (NEW)

    <!-- Migrated services -->
    apps/api-server/src/app/services/task-store.service.ts
    apps/api-server/src/app/services/queue-manager.service.ts
    apps/api-server/src/app/services/rule-engine.service.ts
    apps/api-server/src/app/services/disposition.service.ts
    apps/api-server/src/app/services/task-source.service.ts
    apps/api-server/src/app/services/rbac.service.ts
    apps/api-server/src/app/pipelines/pipeline.service.ts
    apps/api-server/src/app/routing/routing.service.ts
    apps/api-server/src/app/volume-loader/volume-loader.service.ts

    <!-- App module update -->
    apps/api-server/src/app/app.module.ts

    <!-- Package scripts -->
    package.json
  </files>
  <tasks>
    <task id="1">
      <name>Install dependencies + create DatabaseModule</name>
      <action>
        Install new npm packages:
          npm install @nestjs/typeorm typeorm pg
          npm install --save-dev @types/pg

        Create `apps/api-server/src/app/database/database.module.ts`:
        - `DatabaseModule` is a `@Global()` `@Module()` that imports `TypeOrmModule.forRootAsync()`
        - Config reads from env vars:
          - `DATABASE_URL` (full connection string, takes precedence)
          - OR individual: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
        - TypeORM config: `synchronize: false` (use migrations), `logging: process.env.NODE_ENV !== 'production'`
        - Entities loaded from `apps/api-server/src/app/entities/` via glob pattern
        - `migrationsRun: false` (manual via CLI)
        - If `DATABASE_URL` is not set, fall back to in-memory SQLite using `better-sqlite3` for local dev
          without Docker (install `better-sqlite3` and `@types/better-sqlite3` too)

        Create `apps/api-server/src/app/database/data-source.ts`:
        - Exports a TypeORM `DataSource` instance for use by the TypeORM CLI (migrations)
        - Reads same env vars as DatabaseModule
        - Points to `src/migrations/*.ts`

        Add `package.json` scripts:
          "db:migration:generate": "npx typeorm-ts-node-commonjs migration:generate -d apps/api-server/src/app/database/data-source.ts"
          "db:migration:run": "npx typeorm-ts-node-commonjs migration:run -d apps/api-server/src/app/database/data-source.ts"
          "db:seed": "npx ts-node apps/api-server/src/app/database/seed.ts"

        Update `app.module.ts` to import `DatabaseModule` first in the imports array.
      </action>
      <files>
        package.json
        apps/api-server/src/app/database/database.module.ts
        apps/api-server/src/app/database/data-source.ts
        apps/api-server/src/app/database/index.ts
        apps/api-server/src/app/app.module.ts
      </files>
      <verify>
        npx nx build api-server (no TypeScript errors after install)
      </verify>
      <done>
        - @nestjs/typeorm, typeorm, pg, better-sqlite3 installed
        - DatabaseModule created and imported in AppModule
        - DataSource exported for CLI migrations
        - npm scripts for migration and seed added
        - Build passes
      </done>
    </task>

    <task id="2">
      <name>Create TypeORM entities for all core domain objects</name>
      <action>
        Create TypeORM entity files in `apps/api-server/src/app/entities/`.
        Each entity should use `@Entity()`, `@PrimaryGeneratedColumn('uuid')`, and appropriate
        column decorators. Map existing interface fields to columns.

        **task.entity.ts**: maps `Task` interface
          - id: uuid primary key
          - externalId: varchar, unique nullable
          - pipelineId: uuid nullable
          - queueId: uuid nullable
          - status: varchar(20) — TaskStatus enum values
          - priority: smallint default 5
          - payload: jsonb
          - assignedTo: uuid nullable
          - slaDeadline: timestamptz nullable
          - retryCount: smallint default 0
          - maxRetries: smallint default 3
          - enqueuedAt: timestamptz (createdAt)
          - reservedAt: timestamptz nullable
          - completedAt: timestamptz nullable
          - disposition: jsonb nullable
          - @Index() on [queueId, priority, enqueuedAt] WHERE status = 'QUEUED'

        **queued-task.entity.ts**: maps `QueuedTask` (active queue slot)
          - id: uuid primary key
          - taskId: uuid (FK to tasks, unique)
          - queueId: varchar(100)
          - priority: smallint
          - enqueuedAt: timestamptz
          - slaDeadline: timestamptz nullable
          - @Index(['queueId', 'priority', 'enqueuedAt'])

        **dlq-entry.entity.ts**: maps `DLQEntry`
          - id: uuid primary key
          - taskId: uuid
          - queueId: varchar(100)
          - failureReason: varchar(50)
          - payload: jsonb
          - retryCount: smallint
          - failedAt: timestamptz (createdAt)
          - pipelineId: uuid nullable

        **pipeline.entity.ts**: maps `Pipeline`
          - Standard fields; config stored as jsonb

        **pipeline-queue.entity.ts**: maps `PipelineQueue`
          - id, pipelineId (FK), name, priority, requiredSkills (jsonb), maxCapacity,
            slaWarningPercent, slaBreachPercent

        **rule-set.entity.ts** + **rule.entity.ts**: maps `RuleSet` and `Rule`
          - RuleSet: id, name, description, active, pipelineId
          - Rule: id, ruleSetId (FK), name, order, conditions (jsonb), actions (jsonb)

        **disposition.entity.ts**: maps `Disposition`
          - id, name, code, category, description, requiresNote, active

        **skill.entity.ts** + **agent-skill.entity.ts**: maps `Skill` and `AgentSkill`
          - Skill: id, name, category, description
          - AgentSkill: id, agentId, skillId (FK), proficiency, certifiedAt nullable

        **task-source.entity.ts**: maps `TaskSource`
          - id, name, type, config (jsonb), active

        **volume-loader.entity.ts** + **volume-loader-run.entity.ts**

        **work-state-config.entity.ts**: id, state, label, description, allowsWork,
          maxDuration nullable, requiresReason, createdBy

        **user.entity.ts**: id (uuid), username (varchar unique), passwordHash (varchar),
          name, role (varchar), email nullable, active default true

        **team.entity.ts**: id, name, managerId nullable, agentIds (jsonb array)

        Create `apps/api-server/src/app/entities/index.ts` barrel exporting all entities.
      </action>
      <files>
        apps/api-server/src/app/entities/task.entity.ts
        apps/api-server/src/app/entities/queued-task.entity.ts
        apps/api-server/src/app/entities/dlq-entry.entity.ts
        apps/api-server/src/app/entities/pipeline.entity.ts
        apps/api-server/src/app/entities/pipeline-queue.entity.ts
        apps/api-server/src/app/entities/rule-set.entity.ts
        apps/api-server/src/app/entities/rule.entity.ts
        apps/api-server/src/app/entities/disposition.entity.ts
        apps/api-server/src/app/entities/skill.entity.ts
        apps/api-server/src/app/entities/agent-skill.entity.ts
        apps/api-server/src/app/entities/task-source.entity.ts
        apps/api-server/src/app/entities/volume-loader.entity.ts
        apps/api-server/src/app/entities/volume-loader-run.entity.ts
        apps/api-server/src/app/entities/work-state-config.entity.ts
        apps/api-server/src/app/entities/user.entity.ts
        apps/api-server/src/app/entities/team.entity.ts
        apps/api-server/src/app/entities/index.ts
        apps/api-server/src/app/database/database.module.ts
      </files>
      <verify>
        npx nx build api-server (entities compile with no TypeScript errors)
      </verify>
      <done>
        - All 16 entities created with correct TypeORM decorators
        - Entities registered in DatabaseModule's entities array
        - Build passes
      </done>
    </task>

    <task id="3">
      <name>Migrate TaskStoreService and QueueManagerService to TypeORM repositories</name>
      <action>
        **TaskStoreService** (`apps/api-server/src/app/services/task-store.service.ts`):
        - Inject `@InjectRepository(TaskEntity) private taskRepo: Repository&lt;TaskEntity&gt;`
        - Replace all `this.tasks.set(id, task)` with `this.taskRepo.save(taskEntity)`
        - Replace all `this.tasks.get(id)` with `this.taskRepo.findOneBy({ id })`
        - Replace `this.tasks.delete(id)` with `this.taskRepo.delete(id)`
        - Replace `Array.from(this.tasks.values())` with `this.taskRepo.find()`
        - Replace `this.externalIdIndex` with a DB query: `findOneBy({ externalId })`
        - Map between `Task` interface and `TaskEntity` via private `toModel()` / `toEntity()` methods
        - All methods must become async (return `Promise<T>`)
        - Update all callers of TaskStoreService (PipelineOrchestratorService,
          TaskDistributorService, SLAMonitorService, gateway) to await the new async methods

        **QueueManagerService** (`apps/api-server/src/app/services/queue-manager.service.ts`):
        - Inject `@InjectRepository(QueuedTaskEntity)` and `@InjectRepository(DLQEntryEntity)`
        - Replace `this.queues: Map&lt;string, QueuedTask[]&gt;` with DB-backed dequeue:
          `findOne({ where: { queueId }, order: { priority: 'ASC', enqueuedAt: 'ASC' } })`
        - Replace `this.dlq: DLQEntry[]` with `dlqRepo.save()` / `dlqRepo.find()`
        - Keep `completedWaitTimes` as in-memory for now (metrics data, not critical)
        - All methods become async
        - Update all callers

        For both services, add `TypeOrmModule.forFeature([TaskEntity, QueuedTaskEntity, DLQEntryEntity])`
        to `ServicesModule` imports.
      </action>
      <files>
        apps/api-server/src/app/services/task-store.service.ts
        apps/api-server/src/app/services/queue-manager.service.ts
        apps/api-server/src/app/services/pipeline-orchestrator.service.ts
        apps/api-server/src/app/services/task-distributor.service.ts
        apps/api-server/src/app/services/sla-monitor.service.ts
        apps/api-server/src/app/gateway/agent.gateway.ts
        apps/api-server/src/app/tasks/tasks.service.ts
        apps/api-server/src/app/queues/queues.service.ts
        apps/api-server/src/app/services/services.module.ts (add TypeOrmModule.forFeature)
      </files>
      <verify>
        npx nx build api-server
        npx nx test api-server
      </verify>
      <done>
        - TaskStoreService: all in-memory Maps replaced with TypeORM repository calls
        - QueueManagerService: queues and DLQ backed by PostgreSQL
        - All callers updated to handle async (await)
        - Build and tests pass
      </done>
    </task>

    <task id="4">
      <name>Migrate remaining services to TypeORM repositories</name>
      <action>
        Apply the same repository pattern to the remaining services with in-memory stores.
        For each, inject the appropriate `Repository&lt;Entity&gt;` and replace Map/array operations.

        **PipelineService** (`pipelines/pipeline.service.ts`):
        - `pipelines: Map` → `PipelineRepository` (find, save, delete)
        - `queues: Map` → `PipelineQueueRepository`

        **RuleEngineService** (`services/rule-engine.service.ts`):
        - `ruleSets: Map` → `RuleSetRepository` with eager `rules` relation load

        **RoutingService** (`routing/routing.service.ts`):
        - `skills: Map` → `SkillRepository`
        - `agentSkills: Map` → `AgentSkillRepository`
        - Keep `strategies` and `roundRobinIndex` as in-memory (runtime routing state)

        **DispositionService** (`services/disposition.service.ts`):
        - `dispositions: Map` → `DispositionRepository`
        - `completions` → `TaskCompletionRepository` (create TaskCompletion entity)

        **TaskSourceService** (`services/task-source.service.ts`):
        - `sources: Map` → `TaskSourceRepository`
        - Keep `pendingOrders` in-memory (short-lived staging)
        - Keep `activeSourceId` in-memory (runtime state)

        **VolumeLoaderService** (`volume-loader/volume-loader.service.ts`):
        - `loaders: Map` → `VolumeLoaderRepository`
        - `runs` → `VolumeLoaderRunRepository`
        - Keep `scheduledIntervals` in-memory (timer handles can't be serialized)

        **RBACService** (`services/rbac.service.ts`):
        - `users: Map` → `UserRepository` (passwords are hashed bcrypt — bcrypt installed in Plan 3-1)
          For now, keep password as a regular field; hashing wired in Plan 3-1
        - `teams: Map` → `TeamRepository`
        - Keep `sessions: Map` as in-memory (replaced by JWT in Plan 3-1)
        - Keep `roles: Role[]` as in-memory seed (roles are fixed enum values)

        Add all necessary `TypeOrmModule.forFeature([...])` imports to each feature module.
      </action>
      <files>
        apps/api-server/src/app/pipelines/pipeline.service.ts
        apps/api-server/src/app/pipelines/pipelines.module.ts
        apps/api-server/src/app/services/rule-engine.service.ts
        apps/api-server/src/app/services/disposition.service.ts
        apps/api-server/src/app/services/task-source.service.ts
        apps/api-server/src/app/services/rbac.service.ts
        apps/api-server/src/app/routing/routing.service.ts
        apps/api-server/src/app/routing/routing.module.ts
        apps/api-server/src/app/volume-loader/volume-loader.service.ts
        apps/api-server/src/app/volume-loader/volume-loader.module.ts
        apps/api-server/src/app/services/services.module.ts
        apps/api-server/src/app/entities/task-completion.entity.ts (NEW)
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
        npx nx test api-server
      </verify>
      <done>
        - All 7 services migrated to TypeORM repositories
        - TypeOrmModule.forFeature() registered in each feature module
        - Build, lint (0 errors), and tests pass
      </done>
    </task>

    <task id="5">
      <name>Generate TypeORM migration + database seed script</name>
      <action>
        **Generate migration:**
        Run: `npm run db:migration:generate -- apps/api-server/src/migrations/InitialSchema`

        Review the generated migration file to confirm all tables and indexes match the schema
        defined in ARCHITECTURE.md §10 and the entities created in Task 2.

        Key indexes to verify:
        - `idx_queue_dequeue` on `queued_tasks (queue_id, priority ASC, enqueued_at ASC)` WHERE `status = 'QUEUED'`
        - Index on `tasks.external_id` for deduplication

        **Seed script** (`apps/api-server/src/app/database/seed.ts`):
        Create a standalone TypeScript script (not a NestJS module) that:
        1. Creates a TypeORM DataSource and initializes it
        2. Checks if data already exists (idempotent — skip if seeded)
        3. Seeds in order:
           - Default dispositions (RESOLVED, TRANSFERRED, UNRESOLVED, CALLBACK_SCHEDULED)
           - Default work state configs (AVAILABLE, BREAK, LUNCH, TRAINING, MEETING)
           - Default skills (Customer Service, Technical Support, Sales, Billing, Escalations)
           - Test users with bcrypt-hashed passwords (temp: use plain hash placeholder,
             bcrypt wired in Plan 3-1):
             - agent1 / agent1pass → role: AGENT
             - manager1 / manager1pass → role: MANAGER
             - designer1 / designer1pass → role: DESIGNER
             - admin1 / admin1pass → role: ADMIN
           - Default routing strategies (ROUND_ROBIN, LEAST_BUSY, SKILL_BASED)
        4. Log what was seeded
        5. Close connection

        Store seed data constants in `seed-data.ts` for readability.

        **Update `package.json`** with `"db:migrate"` script alias:
          "db:migrate": "npm run db:migration:run"
      </action>
      <files>
        apps/api-server/src/migrations/ (generated migration file)
        apps/api-server/src/app/database/seed.ts
        apps/api-server/src/app/database/seed-data.ts
        package.json
      </files>
      <verify>
        npx nx build api-server
        npm run db:seed (with DATABASE_URL set to a local test DB or SQLite)
        Confirm seed runs without errors and produces expected rows
      </verify>
      <done>
        - Migration file generated for all entities
        - Seed script is idempotent (safe to run multiple times)
        - Test users seeded with correct roles
        - Default reference data seeded (dispositions, work states, skills)
        - npm scripts for migrate and seed work
      </done>
    </task>
  </tasks>
  <dependencies>Wave 1 (1-1-debt-clearance-PLAN.md) must complete first — shared model interfaces used by entities</dependencies>
</plan>
