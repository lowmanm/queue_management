## Execution Summary: Platform Hardening

**Status:** Complete
**Tasks:** 5/5
**Date:** 2026-03-20

### Commits

| Hash | Message |
|---|---|
| dd5923f | feat(webhooks): add per-token rate limiting with @nestjs/throttler (P6-001, P6-002, P6-003) |
| c5f805d | feat(queues): add DLQ auto-retry scheduler service (P6-010, P6-011, P6-012) |
| f5d5788 | feat(queues,audit-log): add bulk queue operations and event sourcing replay (P6-020, P6-022, P6-030) |
| 95d8663 | feat(admin,manager): add DLQ auto-retry config and bulk queue operations UI (P6-013, P6-031) |
| 68cc302 | feat(audit-log): add task replay UI with step-by-step state reconstruction (P6-021) |

### What Was Built

- **Webhook rate limiting** — Per-token ThrottlerGuard; `RATE_LIMITED` delivery status; `rateLimit` field on WebhookEndpoint; `rateLimitedDelivery()` method
- **DLQ auto-retry scheduler** — `@Cron(EVERY_MINUTE)` service; exponential backoff; re-ingestion via PipelineOrchestratorService; `task.retried` event emission
- **Bulk queue operations** — `POST /api/queues/bulk` with partial-success response; `applyBulkAction()` in QueuesService; `activate/deactivate/pause` actions
- **Event sourcing replay** — `replayAggregate(aggregateId)` in EventStoreService; 12-event state reducer; `GET /api/audit-log/replay/:aggregateId` endpoint
- **Queue Config DLQ settings UI** — DLQ Auto-Retry section in create/edit forms; enable toggle; conditional sub-fields; saved in API payload
- **Queue Monitor bulk select UI** — Checkbox per queue card; select-all toggle; Activate/Deactivate/Pause toolbar; success/failure summary
- **Audit Log replay UI** — `startReplay()`/`closeReplay()` methods; inline overlay panel; event timeline with sequence; reconstructed state table

### Files Created

- `apps/api-server/src/app/queues/dlq-auto-retry.service.ts`

### Files Modified

**Backend:**
- `libs/shared-models/src/lib/webhook.interface.ts` — RATE_LIMITED status, rateLimit field
- `libs/shared-models/src/lib/pipeline.interface.ts` — dlqAutoRetry, status fields on PipelineQueue; dlqAutoRetry on CreateQueueRequest/UpdateQueueRequest
- `apps/api-server/src/app/webhooks/webhooks.module.ts` — ThrottlerModule.forRoot()
- `apps/api-server/src/app/webhooks/webhooks.service.ts` — rateLimitedDelivery(), rateLimit param in createEndpoint()
- `apps/api-server/src/app/webhooks/webhooks.controller.ts` — WebhookThrottlerGuard, @UseGuards, @Throttle decorator
- `apps/api-server/src/app/webhooks/webhooks.controller.spec.ts` — ThrottlerModule import
- `apps/api-server/src/app/queues/queues.module.ts` — DlqAutoRetryService, QueuesController registered
- `apps/api-server/src/app/queues/queues.service.ts` — dlqAutoRetry/status fields, applyBulkAction()
- `apps/api-server/src/app/queues/queues.controller.ts` — POST /queues/bulk endpoint
- `apps/api-server/src/app/services/event-store.service.ts` — replayAggregate(), applyEvents() state reducer
- `apps/api-server/src/app/audit-log/audit-log.controller.ts` — GET /audit-log/replay/:aggregateId
- `apps/api-server/src/app/app.module.ts` — ScheduleModule.forRoot()

**Frontend:**
- `apps/agent-workspace/src/app/core/services/manager-api.service.ts` — bulkQueueAction()
- `apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.ts` — DlqAutoRetryConfig state, updateDlqRetryField()
- `apps/agent-workspace/src/app/features/admin/components/queue-config-panel/queue-config-panel.component.html` — DLQ Auto-Retry sections
- `apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.ts` — bulk selection signals and methods
- `apps/agent-workspace/src/app/features/manager/components/queue-monitor/queue-monitor.component.html` — checkboxes, toolbar, result display
- `apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.ts` — replay signals and methods
- `apps/agent-workspace/src/app/features/admin/components/audit-log/audit-log.component.html` — replay overlay panel

### Tech Debt

- agent-workspace: 0 errors (unchanged) ✅
- api-server: 0 errors (unchanged) ✅
- Warnings only (pre-existing, not introduced by this plan)

### Issues Encountered

1. **ThrottlerGuard DI in tests** — `WebhookThrottlerGuard` extends `ThrottlerGuard` which requires `THROTTLER:MODULE_OPTIONS` token. Fixed by importing `ThrottlerModule.forRoot()` in the test module and adding `WebhookThrottlerGuard` to providers.
2. **ScheduleModule.forFeature()** — Does not exist in @nestjs/schedule; only `forRoot()` is needed at app level. Removed the erroneous `forFeature()` call.
3. **TaskEventEntity missing sequenceNum** — Entity doesn't have a sequenceNum column; used array index for sequential ordering in replay instead.
4. **Task interface field mismatches** — `Task` uses `assignedAgentId` (not `agentId`) and has no `retryCount`/`failureReason` at top level. Used `Record<string, unknown>` as the reconstructed state type for maximum flexibility.
