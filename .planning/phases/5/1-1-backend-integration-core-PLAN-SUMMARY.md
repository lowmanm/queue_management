## Execution Summary: Backend Integration Core

**Status:** Complete
**Tasks:** 5/5
**Date:** 2026-03-20

**Commits:**
- `9cea66d` feat(models): add WebhookEndpoint, WebhookDelivery, cross-pipeline RoutingRule fields, callback Pipeline fields
- `fc24a72` feat(webhooks): add WebhooksService with token management and HMAC verification
- `94acd1d` feat(webhooks): add WebhooksController with POST /api/webhooks/:token ingestion
- `ab11c4b` feat(api): add OutboundWebhookService for event-driven external callbacks
- `929d6f6` feat(api): cross-pipeline task routing with hop-limit safety in PipelineOrchestrator
- `5ee84d0` fix(workspace): handle optional targetQueueId in routing rule display templates

---

### What Was Built

- **`WebhookEndpoint` / `WebhookDelivery` interfaces** in shared-models with token/HMAC types
- **`CallbackEvent` union type** and `callbackUrl`/`callbackEvents` on `Pipeline`
- **`targetPipelineId?`** on `RoutingRule` (cross-pipeline routing)
- **`pipelineHops?`** on `Task` (hop safety counter)
- **`WebhooksService`** — in-memory endpoint store, token management, HMAC-SHA256 verification with `timingSafeEqual`
- **`WebhooksController`** — POST /api/webhooks/:token (public, secured by HMAC), + full CRUD endpoints (JWT-protected)
- **`OutboundWebhookService`** — fires HMAC-signed HTTP callbacks for subscribed pipeline events, 3-retry backoff, logs to EventStore
- **EventStoreService hook** — fire-and-forget `setImmediate` call to `OutboundWebhookService.onEvent` after event persistence
- **Cross-pipeline routing in PipelineOrchestratorService** — `MAX_PIPELINE_HOPS=3`, `pipelineHops` counter, `task.pipeline_transferred` event, DLQ on hop limit
- **Vitest test infrastructure for api-server** — vitest.config.ts, vitest.setup.ts, SWC decorator support, project.json test target
- **New `AuditEventType` entries**: `task.pipeline_transferred`, `outbound.webhook.sent`, `outbound.webhook.failed`

---

### Files Created

- `libs/shared-models/src/lib/webhook.interface.ts`
- `apps/api-server/src/app/webhooks/webhooks.service.ts`
- `apps/api-server/src/app/webhooks/webhooks.service.spec.ts`
- `apps/api-server/src/app/webhooks/webhooks.module.ts`
- `apps/api-server/src/app/webhooks/webhooks.controller.ts`
- `apps/api-server/src/app/webhooks/webhooks.controller.spec.ts`
- `apps/api-server/src/app/services/outbound-webhook.service.ts`
- `apps/api-server/src/app/services/outbound-webhook.service.spec.ts`
- `apps/api-server/src/app/services/pipeline-orchestrator.service.spec.ts`
- `apps/api-server/vitest.config.ts`
- `apps/api-server/vitest.setup.ts`

---

### Files Modified

- `libs/shared-models/src/lib/pipeline.interface.ts` — added `CallbackEvent`, `callbackUrl`, `callbackEvents` on Pipeline; `targetPipelineId?` + made `targetQueueId?` optional on RoutingRule
- `libs/shared-models/src/lib/task.interface.ts` — added `pipelineHops?`
- `libs/shared-models/src/lib/audit-event.interface.ts` — added 3 new event types
- `libs/shared-models/src/index.ts` — exported webhook.interface.ts
- `apps/api-server/src/app/app.module.ts` — added WebhooksModule
- `apps/api-server/src/app/services/services.module.ts` — added OutboundWebhookService
- `apps/api-server/src/app/services/event-store.service.ts` — fire-and-forget outbound webhook hook
- `apps/api-server/src/app/services/pipeline-orchestrator.service.ts` — cross-pipeline routing + `_crossPipelineTask` bypass
- `apps/api-server/src/app/entities/pipeline.entity.ts` — added `callbackUrl` + `callbackEvents` columns
- `apps/api-server/src/app/pipelines/pipeline.service.ts` — `routeTask` returns `targetPipelineId` for cross-pipeline rules
- `apps/api-server/tsconfig.app.json` — exclude spec/vitest files from prod build
- `apps/api-server/project.json` — added test target
- `apps/agent-workspace/src/app/features/admin/components/pipelines/pipelines.component.html` — handle optional targetQueueId
- `apps/agent-workspace/src/app/features/admin/components/volume-loader/volume-loader.component.html` — handle optional targetQueueId

---

### Tech Debt

- agent-workspace: 0 → 0 (unchanged)
- api-server: 0 → 0 (unchanged)

New vitest infrastructure added for api-server (25 tests now run on `nx test api-server`).
Previously api-server had no test runner configured.

---

### Issues Encountered

1. **`TooManyRequestsException` not in NestJS version** — replaced with `HttpException` + `HttpStatus.TOO_MANY_REQUESTS`
2. **NestJS DI not working in vitest** — required `unplugin-swc` for decorator metadata emission (`emitDecoratorMetadata`)
3. **Spec files included in webpack build** — fixed by excluding `*.spec.ts` in `tsconfig.app.json`
4. **`targetQueueId` made optional → frontend template errors** — fixed with `?? ''` fallback in 2 HTML templates
5. **`pipeline.service.ts` needed updating** — not in plan's files list but required to return `targetPipelineId` from `routeTask()` so the orchestrator could detect cross-pipeline routing
