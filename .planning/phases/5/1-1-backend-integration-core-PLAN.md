<plan>
  <name>Backend Integration Core</name>
  <wave>1</wave>
  <requirements>P5-001, P5-002, P5-003, P5-004, P5-010, P5-011, P5-012, P5-013, P5-020, P5-021, P5-022, P5-023</requirements>
  <files>
    <!-- Shared Models (new + modified) -->
    libs/shared-models/src/lib/webhook.interface.ts               [NEW] WebhookEndpoint, WebhookDelivery, WebhookStatus
    libs/shared-models/src/lib/pipeline.interface.ts              [MODIFY] add callbackUrl?, callbackEvents?, pipelineHops? to Task; add targetPipelineId? to RoutingRule
    libs/shared-models/src/lib/index.ts                           [MODIFY] export webhook.interface.ts

    <!-- Webhook Ingestion (new feature module) -->
    apps/api-server/src/app/webhooks/webhooks.module.ts           [NEW]
    apps/api-server/src/app/webhooks/webhooks.controller.ts       [NEW] POST /api/webhooks/:token
    apps/api-server/src/app/webhooks/webhooks.service.ts          [NEW] token management, HMAC verify, delivery log
    apps/api-server/src/app/webhooks/webhooks.controller.spec.ts  [NEW]
    apps/api-server/src/app/webhooks/webhooks.service.spec.ts     [NEW]

    <!-- Outbound Webhooks (new core service) -->
    apps/api-server/src/app/services/outbound-webhook.service.ts       [NEW]
    apps/api-server/src/app/services/outbound-webhook.service.spec.ts  [NEW]

    <!-- Modified: pipeline orchestrator for cross-pipeline routing -->
    apps/api-server/src/app/services/pipeline-orchestrator.service.ts  [MODIFY] detect targetPipelineId, hop counter, re-ingest
    apps/api-server/src/app/services/pipeline-orchestrator.service.spec.ts [MODIFY] add cross-pipeline tests

    <!-- Modified: pipeline entities for callback config -->
    apps/api-server/src/app/database/entities/pipeline.entity.ts       [MODIFY] add callbackUrl, callbackEvents columns

    <!-- App wiring -->
    apps/api-server/src/app/app.module.ts                              [MODIFY] import WebhooksModule, provide OutboundWebhookService
  </files>
  <tasks>
    <task id="1">
      <name>Shared models — webhook + cross-pipeline extensions</name>
      <action>
        1. Create `libs/shared-models/src/lib/webhook.interface.ts`:
           ```typescript
           export type WebhookStatus = 'active' | 'inactive';
           export type WebhookDeliveryStatus = 'QUEUED' | 'DLQ' | 'REJECTED' | 'ERROR';

           export interface WebhookEndpoint {
             id: string;
             name: string;
             pipelineId: string;
             token: string;            // opaque 32-byte hex token embedded in URL
             secret: string;           // HMAC-SHA256 signing secret (shown once on creation)
             status: WebhookStatus;
             createdAt: string;
             lastDeliveryAt?: string;
             deliveryCount: number;
           }

           export interface WebhookDelivery {
             id: string;
             webhookId: string;
             receivedAt: string;
             sourceIp?: string;
             payloadBytes: number;
             status: WebhookDeliveryStatus;
             orchestrationStatus?: string;   // QUEUED | DLQ | REJECTED | DUPLICATE
             taskId?: string;
             errorMessage?: string;
             processingMs: number;
           }
           ```

        2. Add to `libs/shared-models/src/lib/pipeline.interface.ts`:
           - On `RoutingRule`: add `targetPipelineId?: string` — when set, routing action is "transfer to pipeline" instead of enqueuing in a queue. `targetQueueId` becomes optional when this field is present.
           - On `Pipeline`: add `callbackUrl?: string` and `callbackEvents?: string[]`
           - Add export for `CallbackEvent` union type: `'task.completed' | 'task.dlq' | 'sla.breach'`

        3. Add to `libs/shared-models/src/lib/task.interface.ts`:
           - On `Task`: add `pipelineHops?: number` (default 0) to track cross-pipeline transfer depth

        4. Export from `libs/shared-models/src/lib/index.ts`:
           ```typescript
           export * from './lib/webhook.interface';
           ```

        Commit: `feat(models): add WebhookEndpoint, WebhookDelivery, cross-pipeline RoutingRule fields, callback Pipeline fields`
      </action>
      <files>
        libs/shared-models/src/lib/webhook.interface.ts
        libs/shared-models/src/lib/pipeline.interface.ts
        libs/shared-models/src/lib/task.interface.ts
        libs/shared-models/src/lib/index.ts
      </files>
      <verify>
        npx nx build shared-models
        npx nx lint shared-models
      </verify>
      <done>
        - `webhook.interface.ts` created and exported from index.ts
        - `RoutingRule.targetPipelineId?: string` and `RoutingRule.targetQueueId` made optional
        - `Pipeline.callbackUrl?: string` and `Pipeline.callbackEvents?: string[]` added
        - `Task.pipelineHops?: number` added
        - `CallbackEvent` union type exported
        - Build passes, lint 0 errors
      </done>
    </task>

    <task id="2">
      <name>WebhooksService — token management, HMAC, delivery log</name>
      <action>
        Create `apps/api-server/src/app/webhooks/webhooks.service.ts` as `@Injectable()`:

        **In-memory store** (same pattern as other services — TypeORM entity upgrade is Phase 6):
        - `endpoints: Map&lt;string, WebhookEndpoint&gt;` keyed by endpoint id
        - `tokenIndex: Map&lt;string, string&gt;` keyed by token → endpoint id (fast lookup)
        - `deliveries: Map&lt;string, WebhookDelivery[]&gt;` keyed by endpoint id

        **Methods:**
        - `createEndpoint(pipelineId, name): WebhookEndpoint`
          - Generate token: `crypto.randomBytes(32).toString('hex')`
          - Generate secret: `crypto.randomBytes(32).toString('hex')`
          - Insert into both maps
        - `listEndpoints(pipelineId?: string): WebhookEndpoint[]`
        - `getEndpoint(id: string): WebhookEndpoint | undefined`
        - `deleteEndpoint(id: string): void` — remove from both maps, remove delivery history
        - `toggleStatus(id: string, status: WebhookStatus): WebhookEndpoint`
        - `regenerateToken(id: string): WebhookEndpoint` — new token, update tokenIndex
        - `lookupByToken(token: string): WebhookEndpoint | undefined`
        - `verifySignature(secret: string, rawBody: string, signatureHeader: string): boolean`
          - `signatureHeader` format: `sha256={hex}`
          - Compute: `'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex')`
          - Use `timingSafeEqual` for comparison (prevent timing attacks)
        - `logDelivery(webhookId: string, delivery: Omit&lt;WebhookDelivery, 'id'&gt;): WebhookDelivery`
        - `getDeliveries(webhookId: string, page: number, limit: number): { items: WebhookDelivery[], total: number }`

        Create `apps/api-server/src/app/webhooks/webhooks.module.ts` — imports WebhooksService and WebhooksController.

        Write spec `webhooks.service.spec.ts` covering:
        - createEndpoint: returns endpoint with unique token
        - verifySignature: valid HMAC returns true; tampered body returns false
        - lookupByToken: returns correct endpoint
        - regenerateToken: old token no longer resolves; new token does

        Commit: `feat(webhooks): add WebhooksService with token management and HMAC verification`
      </action>
      <files>
        apps/api-server/src/app/webhooks/webhooks.service.ts
        apps/api-server/src/app/webhooks/webhooks.service.spec.ts
        apps/api-server/src/app/webhooks/webhooks.module.ts
      </files>
      <verify>
        npx nx test api-server --testFile=webhooks.service.spec.ts
        npx nx run api-server:eslint:lint
      </verify>
      <done>
        - WebhooksService injectable with full CRUD + HMAC
        - `timingSafeEqual` used for signature comparison (no timing attack vector)
        - 4+ tests passing
        - Lint 0 new errors
      </done>
    </task>

    <task id="3">
      <name>WebhooksController — POST /api/webhooks/:token ingestion endpoint</name>
      <action>
        Create `apps/api-server/src/app/webhooks/webhooks.controller.ts`:

        ```typescript
        @Controller('webhooks')
        export class WebhooksController {
          constructor(
            private readonly webhooks: WebhooksService,
            private readonly orchestrator: PipelineOrchestratorService,
          ) {}

          // Public (no JWT required) — secured by HMAC token
          @Public()
          @Post(':token')
          @HttpCode(202)
          async receive(
            @Param('token') token: string,
            @Body() body: Record&lt;string, unknown&gt;,
            @Req() req: Request,
          ): Promise&lt;{ accepted: boolean; taskId?: string; status?: string }&gt;
        ```

        **Implementation:**
        1. Look up endpoint by token → 403 if not found or inactive
        2. Verify HMAC signature if `X-Nexus-Signature` header present; 400 if signature invalid (signature optional in dev, required when secret configured)
        3. Start timer
        4. Build `TaskIngestionInput`: `{ pipelineId: endpoint.pipelineId, source: 'api', data: body }`
        5. Call `orchestrator.ingestTask(input)` → get `OrchestrationResult`
        6. Map result status → HTTP response:
           - QUEUED → 202 `{ accepted: true, taskId, status: 'QUEUED' }`
           - DLQ/REJECTED → 202 `{ accepted: false, status }` (accepted at transport level; business rejection)
           - DUPLICATE → 202 `{ accepted: false, status: 'DUPLICATE' }`
        7. When pipeline queue at capacity (backpressure): return 429
        8. Log delivery via `webhooks.logDelivery()`

        **Additional endpoints (CRUD for admin — protected by JWT):**
        - `GET /webhooks` — list all (optional `?pipelineId=`)
        - `POST /webhooks` — create endpoint `{ pipelineId, name }`
        - `DELETE /webhooks/:id` — delete endpoint
        - `PATCH /webhooks/:id/status` — toggle active/inactive
        - `POST /webhooks/:id/regenerate-token` — regenerate token
        - `GET /webhooks/:id/deliveries` — paginated delivery log `?page=1&limit=20`

        Write spec `webhooks.controller.spec.ts` covering:
        - receive: valid token + valid body → 202 + QUEUED
        - receive: unknown token → 403
        - receive: invalid signature → 400
        - receive: capacity exceeded → 429

        Register `WebhooksModule` in `apps/api-server/src/app/app.module.ts`.

        Commit: `feat(webhooks): add WebhooksController with POST /api/webhooks/:token ingestion`
      </action>
      <files>
        apps/api-server/src/app/webhooks/webhooks.controller.ts
        apps/api-server/src/app/webhooks/webhooks.controller.spec.ts
        apps/api-server/src/app/app.module.ts
      </files>
      <verify>
        npx nx test api-server --testFile=webhooks.controller.spec.ts
        npx nx run api-server:eslint:lint
        npx nx build api-server
      </verify>
      <done>
        - POST /api/webhooks/:token decorated with @Public() (no JWT)
        - CRUD endpoints protected by JwtAuthGuard (default global)
        - 4+ controller tests passing
        - Build compiles, lint 0 new errors
      </done>
    </task>

    <task id="4">
      <name>OutboundWebhookService — event-driven callbacks to external systems</name>
      <action>
        Create `apps/api-server/src/app/services/outbound-webhook.service.ts`:

        **Dependencies:** Inject `PipelineService` (to look up `callbackUrl`/`callbackEvents`) and `EventStoreService` (to log outbound delivery events).

        **Core method:** `async onEvent(event: AuditEvent): Promise&lt;void&gt;`
        - Only process events where `event.aggregateType === 'task'` (tasks have a pipelineId in metadata)
        - Resolve pipeline from event metadata (`pipelineId`)
        - Check if `pipeline.callbackEvents?.includes(event.eventType)` — skip if not subscribed
        - Skip if no `callbackUrl`
        - Build HMAC-signed payload:
          ```typescript
          const payload = {
            taskId: event.aggregateId,
            pipelineId,
            eventType: event.eventType,
            timestamp: event.occurredAt,
            metadata: event.payload,
          };
          const signature = 'sha256=' + createHmac('sha256', OUTBOUND_SECRET)
            .update(JSON.stringify(payload)).digest('hex');
          ```
        - POST to `callbackUrl` with `X-Nexus-Signature: {signature}` header
        - Retry logic with `RETRY_DELAYS = [5000, 25000, 125000]`:
          ```typescript
          for (const delay of RETRY_DELAYS) {
            try { await httpPost(url, payload, headers); return; }
            catch { await sleep(delay); }
          }
          // All retries exhausted
          eventStore.append('outbound.webhook.failed', ...)
          ```
        - On first success: append `outbound.webhook.sent` event to EventStoreService
        - `OUTBOUND_SECRET` read from `process.env.OUTBOUND_WEBHOOK_SECRET` with fallback default

        **Hook into EventStoreService:** In `EventStoreService.append()`, call `outboundWebhookService.onEvent(event)` asynchronously (fire-and-forget via `setImmediate` — don't block task flow).

        **Alternatively**, export `OutboundWebhookService` from `app.module.ts` and call `onEvent()` from EventStoreService via injection.

        Write spec `outbound-webhook.service.spec.ts` covering:
        - onEvent: pipeline has matching callbackEvent + callbackUrl → POST called once
        - onEvent: pipeline has no callbackUrl → no POST
        - onEvent: pipeline not subscribed to event type → no POST
        - onEvent: POST fails all retries → `outbound.webhook.failed` appended

        Commit: `feat(api): add OutboundWebhookService for event-driven external callbacks`
      </action>
      <files>
        apps/api-server/src/app/services/outbound-webhook.service.ts
        apps/api-server/src/app/services/outbound-webhook.service.spec.ts
        apps/api-server/src/app/services/event-store.service.ts      [MODIFY — hook onEvent]
        apps/api-server/src/app/app.module.ts                        [MODIFY — provide OutboundWebhookService]
      </files>
      <verify>
        npx nx test api-server --testFile=outbound-webhook.service.spec.ts
        npx nx run api-server:eslint:lint
        npx nx build api-server
      </verify>
      <done>
        - OutboundWebhookService posts to callbackUrl for subscribed events
        - Retry 3× with 5s/25s/125s delays
        - Failure after 3 retries logs outbound.webhook.failed to EventStore
        - Fire-and-forget (does not block task ingestion)
        - 4+ tests passing, build compiles, lint clean
      </done>
    </task>

    <task id="5">
      <name>Cross-pipeline routing in PipelineOrchestratorService</name>
      <action>
        Modify `apps/api-server/src/app/services/pipeline-orchestrator.service.ts`:

        **Constant:** `MAX_PIPELINE_HOPS = 3`

        **In the ROUTE step**, after evaluating routing rules:
        ```typescript
        if (matchedRule.targetPipelineId) {
          // Cross-pipeline transfer
          const hops = (task.pipelineHops ?? 0) + 1;
          if (hops >= MAX_PIPELINE_HOPS) {
            // Send to DLQ with hop_limit_exceeded
            await this.queueManager.sendToDLQ(task, 'hop_limit_exceeded');
            await this.eventStore.append('task.dlq', task.id, { reason: 'hop_limit_exceeded', hops });
            return { success: false, status: 'DLQ', taskId: task.id };
          }
          // Update task with hop counter and re-ingest into target pipeline
          task.pipelineHops = hops;
          await this.eventStore.append('task.pipeline_transferred', task.id, {
            sourcePipelineId: task.pipelineId,
            targetPipelineId: matchedRule.targetPipelineId,
            hop: hops,
          });
          return this.ingestTask({
            pipelineId: matchedRule.targetPipelineId,
            source: input.source,
            data: task,   // carry transformed task data (rules already applied)
            _crossPipelineTask: task,  // signal to skip dedup check
          });
        }
        ```

        **`TaskIngestionInput` extension** (internal): add optional `_crossPipelineTask?: Task` to pass the already-constructed task object when re-ingesting across pipelines, bypassing dedup and re-creation.

        **Add `pipeline.entity.ts` columns** for `callbackUrl` and `callbackEvents`:
        ```typescript
        @Column({ nullable: true })
        callbackUrl?: string;

        @Column('simple-array', { nullable: true })
        callbackEvents?: string[];
        ```

        Write spec additions to `pipeline-orchestrator.service.spec.ts`:
        - Cross-pipeline rule: task re-ingested into target pipeline
        - Hop limit: task with pipelineHops=2 + cross-pipeline rule → DLQ with hop_limit_exceeded
        - Normal rule with targetQueueId still works

        Commit: `feat(api): cross-pipeline task routing with hop-limit safety in PipelineOrchestrator`
      </action>
      <files>
        apps/api-server/src/app/services/pipeline-orchestrator.service.ts
        apps/api-server/src/app/services/pipeline-orchestrator.service.spec.ts
        apps/api-server/src/app/database/entities/pipeline.entity.ts
      </files>
      <verify>
        npx nx test api-server --testFile=pipeline-orchestrator.service.spec.ts
        npx nx run api-server:eslint:lint
        npx nx build api-server
      </verify>
      <done>
        - RoutingRule.targetPipelineId triggers re-ingestion into target pipeline
        - pipelineHops counter incremented on each transfer
        - MAX_PIPELINE_HOPS=3 enforced; DLQ with hop_limit_exceeded on breach
        - task.pipeline_transferred event emitted on each transfer
        - Pipeline entity has callbackUrl + callbackEvents columns
        - 3+ new spec tests passing
        - Build compiles, lint clean
      </done>
    </task>
  </tasks>
  <dependencies>
    None — Wave 1 starts immediately. No prior Phase 5 plans required.
  </dependencies>
</plan>
