<plan>
  <name>Webhook Config UI</name>
  <wave>2</wave>
  <requirements>P5-005, P5-006, P5-014</requirements>
  <files>
    <!-- New feature component + service -->
    apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.ts    [NEW]
    apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.html  [NEW]
    apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.scss  [NEW]
    apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.spec.ts [NEW]
    apps/agent-workspace/src/app/features/admin/services/webhook-api.service.ts             [NEW]
    apps/agent-workspace/src/app/features/admin/services/webhook-api.service.spec.ts        [NEW]

    <!-- Routing + navigation wiring -->
    apps/agent-workspace/src/app/app.routes.ts                                              [MODIFY] add /admin/webhooks route
    apps/agent-workspace/src/app/shared/components/layout/app-shell/app-shell.component.ts  [MODIFY] add Webhooks sidebar nav item

    <!-- Pipeline wizard: Callbacks step -->
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.ts   [MODIFY] add Callbacks step
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.html [MODIFY] render Callbacks step
    apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.spec.ts [MODIFY] test Callbacks step
  </files>
  <tasks>
    <task id="1">
      <name>WebhookApiService — HTTP client for webhook CRUD + delivery log</name>
      <action>
        Create `apps/agent-workspace/src/app/features/admin/services/webhook-api.service.ts` using `HttpClient`:

        ```typescript
        @Injectable({ providedIn: 'root' })
        export class WebhookApiService {
          private readonly base = `${environment.apiUrl}/webhooks`;

          listEndpoints(pipelineId?: string): Observable&lt;WebhookEndpoint[]&gt;
          createEndpoint(pipelineId: string, name: string): Observable&lt;WebhookEndpoint&gt;
          deleteEndpoint(id: string): Observable&lt;void&gt;
          toggleStatus(id: string, status: WebhookStatus): Observable&lt;WebhookEndpoint&gt;
          regenerateToken(id: string): Observable&lt;WebhookEndpoint&gt;  // returns new token+secret
          getDeliveries(id: string, page: number, limit: number): Observable&lt;{ items: WebhookDelivery[], total: number }&gt;
        }
        ```

        Imports: `WebhookEndpoint`, `WebhookDelivery`, `WebhookStatus` from `@nexus-queue/shared-models`.

        Write spec `webhook-api.service.spec.ts`:
        - listEndpoints: calls GET /webhooks
        - createEndpoint: calls POST /webhooks with body
        - deleteEndpoint: calls DELETE /webhooks/:id
        - regenerateToken: calls POST /webhooks/:id/regenerate-token

        Commit: `feat(workspace): add WebhookApiService for webhook endpoint management`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/services/webhook-api.service.ts
        apps/agent-workspace/src/app/features/admin/services/webhook-api.service.spec.ts
      </files>
      <verify>
        npx nx test agent-workspace --testFile=webhook-api.service.spec.ts
        npx nx lint agent-workspace
      </verify>
      <done>
        - WebhookApiService injectable with all 6 methods
        - Imports from @nexus-queue/shared-models only
        - 4+ tests passing, lint 0 errors
      </done>
    </task>

    <task id="2">
      <name>WebhooksComponent — endpoint list + create + delivery log</name>
      <action>
        Create `apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.ts` as a standalone `OnPush` component with signals:

        **State signals:**
        - `endpoints = signal&lt;WebhookEndpoint[]&gt;([])` — loaded on init
        - `selectedEndpointId = signal&lt;string | null&gt;(null)` — drives delivery log panel
        - `deliveries = signal&lt;WebhookDelivery[]&gt;([])` — delivery log for selected endpoint
        - `deliveryTotal = signal&lt;number&gt;(0)`
        - `deliveryPage = signal&lt;number&gt;(1)`
        - `creating = signal&lt;boolean&gt;(false)` — show create form
        - `newName = signal&lt;string&gt;('')`
        - `selectedPipelineId = signal&lt;string&gt;('')`
        - `pipelines = signal&lt;Pipeline[]&gt;([])` — for create form dropdown
        - `revealedSecret = signal&lt;string | null&gt;(null)` — shown once after creation/regenerate

        **Methods:**
        - `loadEndpoints()` — calls `webhookApi.listEndpoints()`, updates `endpoints`
        - `createEndpoint()` — calls `webhookApi.createEndpoint()`, adds to list, sets `revealedSecret` to show the new secret once
        - `deleteEndpoint(id)` — confirm dialog → delete → reload
        - `toggleStatus(ep)` — toggle active/inactive
        - `regenerateToken(id)` — confirm dialog → regenerate → sets `revealedSecret`
        - `selectEndpoint(id)` — sets selectedEndpointId, loads first delivery page
        - `loadDeliveries(page)` — calls `webhookApi.getDeliveries()`, updates signals
        - `copyUrl(endpoint)` — copies `${apiUrl}/webhooks/${endpoint.token}` to clipboard

        **Template structure (`webhooks.component.html`):**
        ```
        Page header: "Webhook Endpoints" + "Create Webhook" button

        [Left panel — Endpoint List]
        Table: Name | Pipeline | Status | Last Delivery | Actions
        Row actions: Copy URL | Toggle Status | Regenerate Token | Delete

        [Right panel — Delivery Log, shown when selectedEndpointId is set]
        Endpoint detail header: URL (with copy button), Secret reveal section
        Delivery log table: Timestamp | Status | Task ID | Processing Time | Error
        Pagination controls

        [Create form — inline or modal]
        Name input + Pipeline dropdown (from pipelines signal) + Cancel/Create buttons

        [Secret reveal banner — shown after create or regenerate]
        "Save this secret — it will not be shown again."
        Secret value in monospace + copy button + Dismiss button
        ```

        **SCSS:** Match existing admin component styling patterns (use global SCSS variables, no inline styles).

        **Lifecycle:** `ngOnInit` → `loadEndpoints()` + `loadPipelines()`. `takeUntil(destroy$)` on any subscriptions.

        Write spec `webhooks.component.spec.ts`:
        - Renders endpoint list from signal
        - Create button shows create form
        - Creating endpoint calls WebhookApiService and reveals secret
        - Selecting an endpoint loads delivery log
        - Copy URL method called correctly

        Commit: `feat(workspace): add WebhooksComponent with endpoint management and delivery log`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.ts
        apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.html
        apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.scss
        apps/agent-workspace/src/app/features/admin/components/webhooks/webhooks.component.spec.ts
      </files>
      <verify>
        npx nx test agent-workspace --testFile=webhooks.component.spec.ts
        npx nx lint agent-workspace
        npx nx build agent-workspace
      </verify>
      <done>
        - Standalone component with OnPush change detection
        - All state in signals (no BehaviorSubject for UI state)
        - Secret reveal shown once and dismissable
        - 5+ tests passing, lint 0 errors, build compiles
      </done>
    </task>

    <task id="3">
      <name>Route wiring — /admin/webhooks route + sidebar nav</name>
      <action>
        1. **Add route** to `apps/agent-workspace/src/app/app.routes.ts`:
           ```typescript
           {
             path: 'admin/webhooks',
             loadComponent: () =>
               import('./features/admin/components/webhooks/webhooks.component')
                 .then(m => m.WebhooksComponent),
             canActivate: [designerGuard],
             title: 'Webhook Endpoints',
           }
           ```
           Place after `/admin/users` (alphabetically in the admin section).

        2. **Add sidebar nav item** to `AppShellComponent` in the "Configuration" functional area:
           ```typescript
           { label: 'Webhooks', icon: 'webhook', route: '/admin/webhooks', roles: ['DESIGNER', 'ADMIN'] }
           ```
           Use an appropriate Material icon (e.g., `webhook` or `hub`). Match the exact nav-item shape used by existing items (check `app-shell.component.ts` for the current structure).

        Commit: `feat(workspace): wire /admin/webhooks route and sidebar nav item`
      </action>
      <files>
        apps/agent-workspace/src/app/app.routes.ts
        apps/agent-workspace/src/app/shared/components/layout/app-shell/app-shell.component.ts
      </files>
      <verify>
        npx nx lint agent-workspace
        npx nx build agent-workspace
      </verify>
      <done>
        - /admin/webhooks route registered with designerGuard
        - Sidebar shows "Webhooks" under Configuration for DESIGNER + ADMIN roles
        - Lint 0 errors, build compiles
      </done>
    </task>

    <task id="4">
      <name>Pipeline wizard — Callbacks step (callbackUrl + callbackEvents)</name>
      <action>
        Modify `apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.ts`:

        **Add a new step "Callbacks"** between the existing SLA step and the Summary/Review step:

        Step definition:
        ```typescript
        {
          title: 'Callbacks',
          description: 'Notify external systems when tasks complete or breach SLA',
          valid: () => this.callbacksStepValid(),
        }
        ```

        **Form fields for the Callbacks step:**
        - `callbackUrl: FormControl&lt;string&gt;` — optional URL input with `Validators.pattern` for valid URL format
        - `callbackEvents: FormArray` — checkboxes: `task.completed`, `task.dlq`, `sla.breach`
        - Validation: if `callbackUrl` is filled, at least one event must be checked (and vice versa)
        - `callbacksStepValid()`: returns true if both empty (no callbacks) OR both non-empty (URL + at least one event)

        **Template additions (`pipeline-wizard.component.html`):**
        Render the new Callbacks step when `currentStep === callbacksStepIndex`:
        ```html
        &lt;!-- Callbacks Step --&gt;
        &lt;div class="step-callbacks"&gt;
          &lt;p class="step-description"&gt;
            Optionally configure a URL where Nexus will POST events when tasks
            in this pipeline complete, fail to DLQ, or breach SLA.
          &lt;/p&gt;
          &lt;label for="callbackUrl"&gt;Callback URL (optional)&lt;/label&gt;
          &lt;input id="callbackUrl" type="url" [formControl]="callbackUrlControl"
                 placeholder="https://your-system.example.com/nexus-events" /&gt;
          &lt;div class="checkbox-group"&gt;
            &lt;label&gt;Notify on:&lt;/label&gt;
            &lt;label&gt;&lt;input type="checkbox" (change)="toggleCallbackEvent('task.completed', $event)" /&gt; Task Completed&lt;/label&gt;
            &lt;label&gt;&lt;input type="checkbox" (change)="toggleCallbackEvent('task.dlq', $event)" /&gt; Task Sent to DLQ&lt;/label&gt;
            &lt;label&gt;&lt;input type="checkbox" (change)="toggleCallbackEvent('sla.breach', $event)" /&gt; SLA Breach&lt;/label&gt;
          &lt;/div&gt;
          &lt;p class="hint"&gt;Nexus signs all outbound payloads with HMAC-SHA256 (X-Nexus-Signature header).&lt;/p&gt;
        &lt;/div&gt;
        ```

        **Summary step:** Add callback config to the review step display.

        **On save:** Include `callbackUrl` and `callbackEvents` in the pipeline creation/update payload.

        Modify spec to add 2 tests:
        - Callbacks step: valid when both empty
        - Callbacks step: invalid when URL set but no events checked

        Commit: `feat(workspace): add Callbacks step to pipeline wizard for outbound webhook config`
      </action>
      <files>
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.ts
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.html
        apps/agent-workspace/src/app/features/admin/components/pipelines/pipeline-wizard.component.spec.ts
      </files>
      <verify>
        npx nx test agent-workspace --testFile=pipeline-wizard.component.spec.ts
        npx nx lint agent-workspace
        npx nx build agent-workspace
      </verify>
      <done>
        - Callbacks step added between SLA and Summary steps
        - Validation: URL + events must both be filled or both empty
        - callbackUrl and callbackEvents included in pipeline save payload
        - 2+ new tests passing, all existing pipeline-wizard tests still pass
        - Build compiles, lint 0 errors
      </done>
    </task>
  </tasks>
  <dependencies>
    Wave 1 plan `1-1-backend-integration-core-PLAN.md` must be complete — specifically:
    - Shared models (WebhookEndpoint, WebhookDelivery, WebhookStatus) must be built
    - Backend WebhooksController endpoints must exist for WebhookApiService to call
    - Pipeline.callbackUrl/callbackEvents fields must be in the model for the wizard step
  </dependencies>
</plan>
