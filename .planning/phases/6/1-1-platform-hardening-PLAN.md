<plan>
  <name>Platform Hardening</name>
  <wave>1</wave>
  <requirements>P6-001, P6-002, P6-003, P6-010, P6-011, P6-012, P6-013, P6-020, P6-021, P6-022, P6-030, P6-031</requirements>
  <files>
    <!-- Backend -->
    package.json
    apps/api-server/src/app/webhooks/webhooks.module.ts
    apps/api-server/src/app/webhooks/webhooks.service.ts
    apps/api-server/src/app/webhooks/webhooks.controller.ts
    apps/api-server/src/app/queues/dlq-auto-retry.service.ts  [NEW]
    apps/api-server/src/app/queues/queues.module.ts
    apps/api-server/src/app/queues/queues.service.ts
    apps/api-server/src/app/queues/queues.controller.ts
    apps/api-server/src/app/services/event-store.service.ts
    apps/api-server/src/app/audit-log/audit-log.controller.ts
    apps/api-server/src/app/audit-log/audit-log.module.ts

    <!-- Shared models -->
    libs/shared-models/src/lib/webhook.interface.ts
    libs/shared-models/src/lib/pipeline.interface.ts

    <!-- Frontend -->
    apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.ts
    apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.html
    apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.ts
    apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.html
    apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.ts
    apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.html
    apps/agent-workspace/src/app/core/services/manager-api.service.ts
    apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.ts
    apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.html
  </files>
  <tasks>
    <task id="1">
      <name>Webhook rate limiting</name>
      <action>
        Tech debt note: Both projects at 0 errors — no debt task required this phase (exemption recorded in RESEARCH.md).

        Install @nestjs/throttler:
          npm install @nestjs/throttler

        1. Update `WebhookEndpoint` interface in `libs/shared-models/src/lib/webhook.interface.ts`:
           - Add optional `rateLimit?: { limit: number; ttl: number }` field

        2. Update `WebhooksModule` to import `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])`.
           Override can be provided per-endpoint via custom ThrottlerGuard subclass.

        3. In `WebhooksController.receiveWebhook()` (the public POST /:token handler):
           - Apply `@Throttle({ default: { ttl: 60000, limit: 100 } })` decorator
           - Implement a `WebhookThrottlerGuard` that extracts the token from the URL
             and uses it as the throttle key (so each endpoint token gets its own bucket)
           - When throttled: log a `RATE_LIMITED` delivery entry via WebhooksService

        4. Update `WebhooksService`:
           - Add `rateLimitedDelivery(endpointId, token, ip)` method that logs a
             delivery record with status `'RATE_LIMITED'`
           - Expose the endpoint's configured rateLimit in createEndpoint/updateEndpoint
             (store in the in-memory map alongside other endpoint config)

        Commit: `feat(webhooks): add per-token rate limiting with @nestjs/throttler (P6-001, P6-002, P6-003)`
      </action>
      <files>
        package.json
        libs/shared-models/src/lib/webhook.interface.ts
        apps/api-server/src/app/webhooks/webhooks.module.ts
        apps/api-server/src/app/webhooks/webhooks.service.ts
        apps/api-server/src/app/webhooks/webhooks.controller.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
        npx nx test api-server
      </verify>
      <done>
        - `POST /api/webhooks/:token` returns 429 when rate limit exceeded
        - `Retry-After` header present on 429 responses
        - Delivery log records `RATE_LIMITED` status
        - `WebhookEndpoint.rateLimit` field in shared models
        - 0 lint errors in api-server
        - All tests pass
      </done>
    </task>

    <task id="2">
      <name>DLQ auto-retry service</name>
      <action>
        1. Update `PipelineQueue` interface in `libs/shared-models/src/lib/pipeline.interface.ts`:
           Add optional field:
           ```typescript
           dlqAutoRetry?: {
             enabled: boolean;
             intervalMinutes: number;
             maxRetries: number;
             backoffMultiplier: number;
           };
           ```

        2. Create `apps/api-server/src/app/queues/dlq-auto-retry.service.ts`:
           - `@Injectable()` NestJS service
           - `@Cron(CronExpression.EVERY_MINUTE)` method `runAutoRetry()`
           - Queries all queues with `dlqAutoRetry.enabled === true`
           - For each queue, calls `QueueManagerService.getDlqTasks({ queueId })` to get
             DLQ entries with `retryCount < dlqAutoRetry.maxRetries`
           - Calculates backoff delay: `intervalMinutes * Math.pow(backoffMultiplier, retryCount)`
           - Only retries tasks where `timeSinceLastAttempt >= backoffDelay`
           - Re-ingests via `PipelineOrchestratorService.ingestTask(task)` with the source
             pipeline's ID
           - Increments retry count on the DLQ entry
           - Emits `task.dlq.auto_retried` domain event via `EventStoreService.emit()`

        3. Register `DlqAutoRetryService` in `queues.module.ts`; import `ScheduleModule.forFeature()`
           if not already present at module level; ensure `ServicesModule` is imported.

        Commit: `feat(queues): add DLQ auto-retry scheduler service (P6-010, P6-011, P6-012)`
      </action>
      <files>
        libs/shared-models/src/lib/pipeline.interface.ts
        apps/api-server/src/app/queues/dlq-auto-retry.service.ts
        apps/api-server/src/app/queues/queues.module.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
        npx nx test api-server
      </verify>
      <done>
        - `DlqAutoRetryService` exists and is registered in QueuesModule
        - `@Cron(EVERY_MINUTE)` triggers auto-retry logic
        - `dlqAutoRetry` field added to `PipelineQueue` shared model
        - `task.dlq.auto_retried` event emitted per retry
        - 0 lint errors
        - All tests pass
      </done>
    </task>

    <task id="3">
      <name>Bulk queue operations and event sourcing replay (backend)</name>
      <action>
        ### Bulk Queue Operations

        1. Add `POST /api/queues/bulk` endpoint in `QueuesController`:
           - Body: `{ ids: string[], action: 'activate' | 'deactivate' | 'pause' }`
           - Iterates through `ids`, calls `QueuesService.applyBulkAction(id, action)` per queue
           - Collects results: `{ succeeded: string[], failed: { id: string, reason: string }[] }`
           - Returns 200 with results (partial success is allowed; failures are reported, not thrown)

        2. Add `applyBulkAction(id, action)` method in `QueuesService`:
           - `activate`: sets `queue.active = true`
           - `deactivate`: sets `queue.active = false`
           - `pause`: sets `queue.status = 'paused'` (add `status` field to `QueueConfig` if not present)
           - Updates the in-memory queue store via TypeORM

        ### Event Sourcing Replay

        3. Add `replayAggregate(aggregateId)` method in `EventStoreService`:
           - Queries all events for `aggregateId` ordered by `sequenceNum ASC`
           - Applies events in order to reconstruct task state using a state reducer:
             - `task.ingested` → sets initial task fields
             - `task.queued` → updates status to QUEUED, sets queueId
             - `task.assigned` → updates status to RESERVED, sets agentId
             - `task.accepted` → updates status to ACTIVE
             - `task.rejected` → updates status to IDLE (agent), sets task back to queue
             - `task.completed` → updates status to COMPLETED
             - `task.dlq` → updates status to DLQ, sets failureReason
             - `task.retried` / `task.dlq.auto_retried` → increments retryCount
             - `agent.state_changed` / `sla.warning` / `sla.breach` → no task state change
           - Returns: `{ events: AuditEvent[], reconstructedState: Partial<Task> }`

        4. Add `GET /api/audit-log/replay/:aggregateId` endpoint in `AuditLogController`:
           - Calls `EventStoreService.replayAggregate(aggregateId)`
           - Protected by JwtAuthGuard (admin-only enforced at frontend; any authenticated user on backend)
           - Returns the replay result object

        Commit: `feat(queues,audit-log): add bulk queue operations and event sourcing replay (P6-020, P6-022, P6-030)`
      </action>
      <files>
        apps/api-server/src/app/queues/queues.controller.ts
        apps/api-server/src/app/queues/queues.service.ts
        apps/api-server/src/app/services/event-store.service.ts
        apps/api-server/src/app/audit-log/audit-log.controller.ts
        apps/api-server/src/app/audit-log/audit-log.module.ts
      </files>
      <verify>
        npx nx build api-server
        npx nx run api-server:eslint:lint
        npx nx test api-server
      </verify>
      <done>
        - `POST /api/queues/bulk` returns `{ succeeded, failed }` for activate/deactivate/pause actions
        - `GET /api/audit-log/replay/:aggregateId` returns `{ events, reconstructedState }`
        - `EventStoreService.replayAggregate()` applies domain events as state reducer
        - 0 lint errors
        - All tests pass
      </done>
    </task>

    <task id="4">
      <name>Queue Config DLQ settings + Queue Monitor bulk select (frontend)</name>
      <action>
        ### Queue Configuration Panel — DLQ Auto-Retry Settings (P6-013)

        In `queue-config-panel.component.ts`:
        - Add form fields for `dlqAutoRetry`: `enabled` (checkbox), `intervalMinutes` (number input),
          `maxRetries` (number input), `backoffMultiplier` (number input, default 2)
        - Bind to the `PipelineQueue.dlqAutoRetry` model field
        - Only show interval/maxRetries/backoffMultiplier when enabled is checked
        - Include in save payload sent to `POST/PUT /api/pipelines/:id/queues`

        In `queue-config-panel.component.html`:
        - Add "DLQ Auto-Retry" section below existing queue config fields
        - Enable toggle → conditionally shows sub-fields
        - Help text: "Automatically retry DLQ tasks on a schedule. Backoff delay =
          interval × multiplier^retryCount minutes."

        ### Queue Monitor — Bulk Selection (P6-031)

        In `queue-monitor.component.ts`:
        - Add `selectedQueueIds = signal<Set<string>>(new Set())`
        - `toggleSelect(id)`, `selectAll()`, `clearSelection()`, `hasSelection()` helpers
        - `applyBulkAction(action: 'activate' | 'deactivate' | 'pause')` calls
          `POST /api/queues/bulk` via `ManagerApiService.bulkQueueAction(ids, action)`
          and refreshes the queue list on success

        Add `bulkQueueAction(ids: string[], action: string)` to `ManagerApiService`.

        In `queue-monitor.component.html`:
        - Add checkbox column to the queue table (header: select-all toggle)
        - Show bulk action toolbar below the filter row when `hasSelection()` is true:
          "Activate", "Deactivate", "Pause" buttons with confirmation prompt
        - Display success/failure summary after bulk action

        Commit: `feat(admin,manager): add DLQ auto-retry config and bulk queue operations UI (P6-013, P6-031)`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.ts
        apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.html
        apps/agent-workspace/src/app/core/services/manager-api.service.ts
        apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.ts
        apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.html
      </files>
      <verify>
        npx nx build agent-workspace
        npx nx lint agent-workspace
        npx nx test agent-workspace
      </verify>
      <done>
        - Queue config panel shows DLQ Auto-Retry section with enable toggle + sub-fields
        - Sub-fields (interval, maxRetries, backoffMultiplier) hidden when disabled
        - Queue monitor shows checkbox per row + select-all header checkbox
        - Bulk action toolbar appears when ≥1 queue selected
        - Activate/Deactivate/Pause buttons call `POST /api/queues/bulk`
        - 0 lint errors
        - All tests pass
      </done>
    </task>

    <task id="5">
      <name>Audit Log replay UI (frontend)</name>
      <action>
        In `audit-log.component.ts`:
        - Add `replayingAggregateId = signal<string | null>(null)`
        - Add `replayData = signal<{ events: AuditEvent[], reconstructedState: Partial<Task> } | null>(null)`
        - Add `replayError = signal<string>('')`
        - Add `isReplaying = signal(false)`
        - Add `startReplay(aggregateId: string)` method:
          - Sets `replayingAggregateId`
          - Calls `GET /api/audit-log/replay/:aggregateId` via `HttpClient` (or SessionApiService)
          - Populates `replayData` or `replayError`
        - Add `closeReplay()` method: resets replay signals

        In `audit-log.component.html` (admin-only — component is behind adminGuard route):
        - Group events by `aggregateId` in the list display (task-level grouping)
        - Add "Replay Task" button per task aggregate group (or per individual task row)
        - When `replayData()` is non-null, show a modal/panel overlay:
          - Title: "Task Replay — [aggregateId]"
          - Step timeline: for each event in `replayData().events`, show:
            - Event type (badge), occurred at timestamp, sequence number
            - State delta (fields changed by this event shown in before/after format)
          - Final reconstructed state table at bottom
          - "Close" button calls `closeReplay()`
        - Show loading spinner when `isReplaying()` is true
        - Show error message when `replayError()` is non-empty

        Note: No new route needed; replay UI is inline within AuditLogComponent.

        Commit: `feat(audit-log): add task replay UI with step-by-step state reconstruction (P6-021)`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.ts
        apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.html
      </files>
      <verify>
        npx nx build agent-workspace
        npx nx lint agent-workspace
        npx nx test agent-workspace
      </verify>
      <done>
        - Audit log groups events by aggregateId with "Replay Task" button
        - Clicking opens inline replay panel showing event sequence + state reconstruction
        - Loading and error states handled
        - "Close" button dismisses the replay panel
        - 0 lint errors
        - All tests pass
      </done>
    </task>
  </tasks>
  <dependencies>
    None — Wave 1 plan has no predecessors.
  </dependencies>
</plan>
